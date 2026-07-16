from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Callable

import numpy as np
import torch

from backend.prediction.config import COMMUNITY_IDS
from backend.prediction.data_source import (
    build_dense_history_matrix,
    get_available_date_range,
    get_daily_rows,
)
from backend.prediction.runtime import RuntimeRegistry
from backend.prediction.schemas import InstanceShapResult, MapPredictionResult, PredictionResult, TensorSample
from backend.prediction.windowing import forecast_dates, forecast_window, history_dates, history_window


@dataclass(frozen=True)
class InferenceContext:
    model_name: str
    anchor_date: date
    sample: TensorSample
    history_matrix: np.ndarray


class PredictionService:
    def __init__(self):
        self.registry = RuntimeRegistry()

    def _build_history_matrix(self, anchor_date: date, seq_len: int, db: Any | None = None) -> tuple[np.ndarray, list[date], str]:
        # Compute the date range for the history window: seq_len days ending on anchor_date (inclusive)
        hist_days = history_dates(anchor_date, seq_len=seq_len)
        hist_start, hist_end_exclusive = history_window(anchor_date, seq_len=seq_len)
        min_day, max_day, range_source = get_available_date_range(db=db)
        # The earliest valid anchor is min_day + seq_len - 1 because we need seq_len full days of history
        earliest_anchor = min_day + timedelta(days=seq_len - 1)

        if hist_start < min_day:
            raise RuntimeError(
                f"Not enough history for anchor date {anchor_date.isoformat()}; "
                f"earliest supported anchor date is {earliest_anchor.isoformat()}"
            )
        if anchor_date > max_day:
            raise RuntimeError(
                f"Anchor date {anchor_date.isoformat()} is beyond available data max {max_day.isoformat()} ({range_source})"
            )

        rows, source = get_daily_rows(hist_start, hist_end_exclusive, db=db)
        # build_dense_history_matrix fills missing days with zeros to guarantee a (seq_len, 77) array
        matrix = build_dense_history_matrix(rows, hist_days, community_ids=COMMUNITY_IDS)
        return matrix, hist_days, source

    def predict_by_date(self, anchor_date: date, model_name: str, db: Any | None = None) -> tuple[PredictionResult, str]:
        bundle = self.registry.get(model_name)
        seq_len = int(bundle.cfg["seq_len"])
        pred_len = int(bundle.cfg["pred_len"])

        history_matrix, hist_days, source = self._build_history_matrix(anchor_date, seq_len=seq_len, db=db)
        # bundle.predict runs the full model pipeline: scale → inference → unscale
        # Returns a (pred_len, 77) float32 array — one row per forecast day, one column per community
        forecast_daily = bundle.predict(history_matrix, anchor_date)
        # Sum across all forecast days to get one total per community for map coloring
        forecast_sum = forecast_daily.sum(axis=0).astype(np.float32)

        pred_days = forecast_dates(anchor_date, pred_len=pred_len)
        return (
            PredictionResult(
                model_name=model_name,
                anchor_date=anchor_date,
                history_dates=hist_days,
                forecast_dates=pred_days,
                forecast_daily=forecast_daily,
                forecast_totals=forecast_sum,
            ),
            source,
        )

    def map_prediction(self, anchor_date: date, model_name: str, db: Any | None = None) -> tuple[MapPredictionResult, str]:
        pred, source = self.predict_by_date(anchor_date=anchor_date, model_name=model_name, db=db)
        start, end_exclusive = forecast_window(anchor_date, pred_len=pred.forecast_daily.shape[0])

        return (
            MapPredictionResult(
                layer="community_area",
                start=start,
                end_exclusive=end_exclusive,
                model_name=model_name,
                totals=pred.forecast_totals,
            ),
            source,
        )

    def build_inference_context(self, anchor_date: date, model_name: str, db: Any | None = None) -> InferenceContext:
        bundle = self.registry.get(model_name)
        history_matrix, _, _ = self._build_history_matrix(anchor_date, seq_len=int(bundle.cfg["seq_len"]), db=db)
        sample = bundle.prepare_sample(history_matrix, anchor_date)
        return InferenceContext(
            model_name=model_name,
            anchor_date=anchor_date,
            sample=sample,
            history_matrix=history_matrix,
        )

    def _background_anchor_dates(
        self,
        seq_len: int,
        requested_size: int,
        db: Any | None,
    ) -> list[date]:
        min_day, max_day, _ = get_available_date_range(db=db)
        # The earliest valid anchor needs seq_len days of history before it
        earliest_anchor = min_day + timedelta(days=seq_len - 1)
        latest_anchor = max_day
        if latest_anchor < earliest_anchor:
            raise RuntimeError("Not enough available history to build SHAP background set")

        total = (latest_anchor - earliest_anchor).days + 1
        # Cap sample_n so we never request more background samples than dates available
        sample_n = min(max(1, requested_size), total)
        # Note: no seed — background selection is non-deterministic across calls.
        # This is a known issue; SHAP values will vary slightly between identical requests.
        rng = np.random.default_rng()
        offsets = rng.choice(total, size=sample_n, replace=False)
        return [earliest_anchor + timedelta(days=int(off)) for off in offsets]

    def _make_kernel_predict_fn(
        self,
        *,
        model: torch.nn.Module,
        device: torch.device,
        seq_len: int,
        enc_in: int,
        label_len: int,
        pred_len: int,
        horizon_idx: int,
        community_idx: int,
        include_marks: bool,
        mark_dim: int,
        fixed_y_mark: torch.Tensor | None,
    ) -> Callable[[np.ndarray], np.ndarray]:
        # Returns a closure that KernelExplainer will call repeatedly with batches of
        # perturbed inputs. The closure reconstructs proper (batch, seq_len, enc_in)
        # tensors from the flattened numpy arrays that SHAP works with internally.
        @torch.no_grad()
        def predict_fn(z_flat_np: np.ndarray) -> np.ndarray:
            z = torch.tensor(z_flat_np, dtype=torch.float32, device=device)
            batch = z.shape[0]
            x_dim_flat = seq_len * enc_in  # number of encoder input elements when flattened

            if include_marks:
                mark_flat = seq_len * mark_dim
                # Split the flattened input back into encoder features and time marks
                x_part = z[:, :x_dim_flat].view(-1, seq_len, enc_in)
                x_mark_part = z[:, x_dim_flat : x_dim_flat + mark_flat].view(-1, seq_len, mark_dim)
            else:
                x_part = z[:, :x_dim_flat].view(-1, seq_len, enc_in)
                x_mark_part = None

            # Decoder input: last label_len steps of encoder history + zeros for the forecast window
            # This matches the inference pattern used during model training
            label_hist = x_part[:, -label_len:, :]
            zeros = torch.zeros((batch, pred_len, enc_in), device=device, dtype=x_part.dtype)
            dec_inp = torch.cat([label_hist, zeros], dim=1)

            if include_marks and fixed_y_mark is not None:
                # y_mark is fixed (not perturbed) — it's the decoder time features, not an input being explained
                y_mark_part = fixed_y_mark.repeat(batch, 1, 1)
            else:
                y_mark_part = None

            outputs = model(x_part, x_mark_part, dec_inp, y_mark_part)
            if isinstance(outputs, (tuple, list)):
                outputs = outputs[0]
            outputs = outputs[:, -pred_len:, :]
            # Extract the single scalar output for the target (horizon, community) pair
            scalar = outputs[:, horizon_idx, community_idx]
            return scalar.detach().cpu().numpy()

        return predict_fn

    def explain_instance_shap(
        self,
        anchor_date: date,
        model_name: str,
        target_horizon: int,
        target_community_id: int,
        background_size: int = 1,
        nsamples: int | str = "auto",
        top_k: int = 20,
        db: Any | None = None,
    ) -> tuple[InstanceShapResult, str]:
        # Lazy import so non-SHAP prediction endpoints do not require shap.
        try:
            import shap  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("SHAP is not installed. Install with `pip install shap`.") from exc

        bundle = self.registry.get(model_name)
        seq_len = int(bundle.cfg["seq_len"])
        pred_len = int(bundle.cfg["pred_len"])
        label_len = int(bundle.cfg["label_len"])
        enc_in = int(bundle.cfg["enc_in"])

        if target_horizon < 1 or target_horizon > pred_len:
            raise RuntimeError(f"target_horizon must be in [1, {pred_len}]")
        if target_community_id < 1 or target_community_id > len(COMMUNITY_IDS):
            raise RuntimeError(f"target_community_id must be in [1, {len(COMMUNITY_IDS)}]")

        horizon_idx = target_horizon - 1  # convert 1-based UI horizon to 0-based tensor index
        community_idx = target_community_id - 1  # convert 1-based UI community ID to 0-based tensor index

        history_matrix, hist_days, source = self._build_history_matrix(anchor_date, seq_len=seq_len, db=db)
        sample = bundle.prepare_sample(history_matrix, anchor_date)

        # Check whether the model uses time marks (calendar features alongside crime counts)
        include_marks = sample.x_mark_enc is not None and sample.x_mark_dec is not None
        # x_explain is the (seq_len, enc_in) encoder input for the query sample — what we are explaining
        x_explain = np.asarray(sample.x_enc[0], dtype=np.float32)
        x_dim_flat = seq_len * enc_in  # flat size of encoder features only, used to split marks later

        if include_marks:
            x_mark_explain = np.asarray(sample.x_mark_enc[0], dtype=np.float32)
            mark_dim = int(x_mark_explain.shape[-1])
            # y_mark is fixed across all SHAP perturbations — it's decoder time features, not an input being attributed
            fixed_y_mark = torch.tensor(sample.x_mark_dec, dtype=torch.float32, device=bundle.device)
        else:
            x_mark_explain = None
            mark_dim = 0
            fixed_y_mark = None

        bg_anchor_dates = self._background_anchor_dates(
            seq_len=seq_len,
            requested_size=max(1, background_size),
            db=db,
        )

        # Build the background dataset: one (seq_len, enc_in) history matrix per background anchor date
        bg_x: list[np.ndarray] = []
        bg_x_mark: list[np.ndarray] = []
        for bg_anchor in bg_anchor_dates:
            bg_history, _, _ = self._build_history_matrix(bg_anchor, seq_len=seq_len, db=db)
            bg_sample = bundle.prepare_sample(bg_history, bg_anchor)
            bg_x.append(np.asarray(bg_sample.x_enc[0], dtype=np.float32))
            if include_marks:
                if bg_sample.x_mark_enc is None:
                    raise RuntimeError("Background sample is missing x_mark_enc while marks are required")
                bg_x_mark.append(np.asarray(bg_sample.x_mark_enc[0], dtype=np.float32))

        # Flatten all background samples to (n_background, seq_len * enc_in) for KernelExplainer
        bg_x_np = np.stack(bg_x, axis=0)
        bg_features_flat = bg_x_np.reshape(bg_x_np.shape[0], -1)

        if include_marks and x_mark_explain is not None:
            # Concatenate mark features onto the end of the flattened encoder features
            # Both background and query must use the same concatenation order
            bg_x_mark_np = np.stack(bg_x_mark, axis=0)
            bg_features_flat = np.concatenate([bg_features_flat, bg_x_mark_np.reshape(bg_x_mark_np.shape[0], -1)], axis=1)
            x_query_flat = np.concatenate([x_explain.reshape(1, -1), x_mark_explain.reshape(1, -1)], axis=1)
        else:
            x_query_flat = x_explain.reshape(1, -1)

        predict_fn = self._make_kernel_predict_fn(
            model=bundle.model,
            device=bundle.device,
            seq_len=seq_len,
            enc_in=enc_in,
            label_len=label_len,
            pred_len=pred_len,
            horizon_idx=horizon_idx,
            community_idx=community_idx,
            include_marks=include_marks,
            mark_dim=mark_dim,
            fixed_y_mark=fixed_y_mark,
        )

        prediction = float(predict_fn(x_query_flat)[0])
        explainer = shap.KernelExplainer(predict_fn, bg_features_flat)
        # SHAP>=0.47 defaults KernelExplainer to l1_reg="num_features(10)", which explains
        # only ~10 of the flattened inputs (e.g. 10 of 90×77). The UI sums by community,
        # so almost every polygon stays at 0. Use l1_reg=0 and enough coalition samples.
        n_features = int(x_query_flat.shape[1])
        if isinstance(nsamples, str) and nsamples.strip().lower() == "auto":
            # With l1_reg=0, SHAP needs enough coalitions for a stable fit; cap for latency (~10s typical).
            coalitions = min(max(2 * n_features + 2048, 384), 512)
        else:
            coalitions = max(64, int(nsamples))
            coalitions = min(coalitions, 8192)
        raw_values = explainer.shap_values(x_query_flat, nsamples=coalitions, l1_reg=0)
        if isinstance(raw_values, list):
            raw_values = raw_values[0]

        # raw_values is (1, n_features_flat) — flatten to 1D then take only the encoder feature slice
        # (marks are appended after x_dim_flat; we only attribute encoder inputs to communities)
        shap_flat = np.asarray(raw_values, dtype=np.float32).reshape(-1)
        shap_x = shap_flat[:x_dim_flat].reshape(seq_len, enc_in)  # → (90, 77): lag × community

        # expected_value is KernelExplainer's baseline — the mean prediction over background samples
        expected = explainer.expected_value
        if isinstance(expected, np.ndarray):
            baseline = float(np.asarray(expected).reshape(-1)[0])
        else:
            baseline = float(expected)

        # Find the top_k features by absolute SHAP value using argpartition (faster than full sort)
        abs_vals = np.abs(shap_x)
        k = max(1, min(int(top_k), shap_x.size))
        flat_idx = np.argpartition(abs_vals.ravel(), -k)[-k:]
        # Re-sort the top-k indices by descending absolute value so results are ordered
        ordered = flat_idx[np.argsort(abs_vals.ravel()[flat_idx])[::-1]]

        top_features: list[dict[str, float | int | str]] = []
        for idx in ordered:
            lag_idx, comm_idx = np.unravel_index(int(idx), shap_x.shape)
            top_features.append(
                {
                    "history_index": int(lag_idx),
                    "history_date": hist_days[lag_idx].isoformat(),
                    "community_id": int(comm_idx + 1),  # convert back to 1-based for the UI
                    "shap_value": float(shap_x[lag_idx, comm_idx]),
                    "abs_shap_value": float(abs_vals[lag_idx, comm_idx]),
                }
            )

        return (
            InstanceShapResult(
                model_name=model_name,
                anchor_date=anchor_date,
                target_date=anchor_date + timedelta(days=target_horizon),
                target_horizon=target_horizon,
                target_community_id=target_community_id,
                history_dates=hist_days,
                prediction=prediction,
                baseline=baseline,
                shap_values=shap_x,
                top_features=top_features,
            ),
            source,
        )


prediction_service = PredictionService()
