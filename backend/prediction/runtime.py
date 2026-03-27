from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch

from backend.prediction.config import COMMUNITY_IDS, LABEL_LEN, PRED_LEN, PRED_MODELS_DIR, SEQ_LEN, resolve_device
from backend.prediction.models import build_model
from backend.prediction.models.timefeatures import time_features
from backend.prediction.schemas import TensorSample


REQUIRED_CONFIG_KEYS = {
    "model_type",
    "seq_len",
    "label_len",
    "pred_len",
    "enc_in",
    "dec_in",
    "c_out",
    "d_model",
    "d_ff",
    "e_layers",
    "d_layers",
    "n_heads",
    "dropout",
}


@dataclass
class ModelBundle:
    model_name: str
    model_type: str
    cfg: dict[str, Any]
    model: torch.nn.Module
    device: torch.device
    mean: np.ndarray
    std: np.ndarray
    community_ids: np.ndarray

    def _build_mark_array(self, dates: list[date], freq: str) -> np.ndarray:
        idx = pd.to_datetime([d.isoformat() for d in dates])
        marks = time_features(idx, freq=freq).T
        return marks.astype(np.float32)

    def prepare_sample(self, history_matrix: np.ndarray, anchor_date: date) -> TensorSample:
        if history_matrix.shape != (self.cfg["seq_len"], self.cfg["enc_in"]):
            raise RuntimeError(
                f"history_matrix shape {history_matrix.shape} does not match expected "
                f"({self.cfg['seq_len']}, {self.cfg['enc_in']})"
            )

        std = np.where(self.std == 0, 1.0, self.std)
        scaled = ((history_matrix - self.mean) / std).astype(np.float32)

        label_len = int(self.cfg["label_len"])
        pred_len = int(self.cfg["pred_len"])
        freq = str(self.cfg.get("freq", "d"))
        embed = str(self.cfg.get("embed", "timeF"))

        x_enc = scaled[None, :, :]
        hist_part = scaled[-label_len:, :]
        zeros = np.zeros((pred_len, scaled.shape[1]), dtype=np.float32)
        x_dec = np.concatenate([hist_part, zeros], axis=0)[None, :, :]

        if embed == "None":
            x_mark_enc = None
            x_mark_dec = None
        else:
            history_days = [anchor_date - timedelta(days=self.cfg["seq_len"] - 1 - i) for i in range(self.cfg["seq_len"])]
            label_days = history_days[-label_len:]
            future_days = [anchor_date + timedelta(days=i + 1) for i in range(pred_len)]
            dec_days = label_days + future_days

            x_mark_enc = self._build_mark_array(history_days, freq)[None, :, :]
            x_mark_dec = self._build_mark_array(dec_days, freq)[None, :, :]

        return TensorSample(
            x_enc=x_enc,
            x_mark_enc=x_mark_enc,
            x_dec=x_dec,
            x_mark_dec=x_mark_dec,
        )

    def predict(self, history_matrix: np.ndarray, anchor_date: date) -> np.ndarray:
        sample = self.prepare_sample(history_matrix, anchor_date)

        x_enc = torch.tensor(sample.x_enc, dtype=torch.float32, device=self.device)
        x_dec = torch.tensor(sample.x_dec, dtype=torch.float32, device=self.device)

        if sample.x_mark_enc is None:
            x_mark_enc = None
            x_mark_dec = None
        else:
            x_mark_enc = torch.tensor(sample.x_mark_enc, dtype=torch.float32, device=self.device)
            x_mark_dec = torch.tensor(sample.x_mark_dec, dtype=torch.float32, device=self.device)

        with torch.no_grad():
            out = self.model(x_enc, x_mark_enc, x_dec, x_mark_dec)
            if isinstance(out, (tuple, list)):
                out = out[0]
            out = out[:, -self.cfg["pred_len"] :, :]

        pred = out.detach().cpu().numpy()[0]
        pred = pred * self.std[None, :] + self.mean[None, :]
        return pred.astype(np.float32)


def _strip_module_prefix(state_dict: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
    if not state_dict:
        return state_dict
    first_key = next(iter(state_dict.keys()))
    if not first_key.startswith("module."):
        return state_dict
    return {k.replace("module.", "", 1): v for k, v in state_dict.items()}


def _normalize_legacy_state_dict_keys(state_dict: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
    normalized: dict[str, torch.Tensor] = {}
    for key, value in state_dict.items():
        # Upstream repo uses tokenConv; local runtime uses token_conv.
        fixed = key.replace(".tokenConv.", ".token_conv.")
        normalized[fixed] = value
    return normalized


def _extract_state_dict(state_obj: Any) -> dict[str, torch.Tensor]:
    if isinstance(state_obj, dict):
        for key in ("state_dict", "model_state_dict", "model"):
            maybe = state_obj.get(key)
            if isinstance(maybe, dict):
                return maybe
        if all(torch.is_tensor(v) for v in state_obj.values()):
            return state_obj
    raise RuntimeError("Could not extract parameter state_dict from checkpoint payload")


def _filter_to_model_keys(
    state_dict: dict[str, torch.Tensor],
    model: torch.nn.Module,
) -> dict[str, torch.Tensor]:
    expected = set(model.state_dict().keys())
    return {k: v for k, v in state_dict.items() if k in expected}


def _load_config(config_path: Path) -> dict[str, Any]:
    cfg = json.loads(config_path.read_text())
    missing = REQUIRED_CONFIG_KEYS - set(cfg.keys())
    if missing:
        raise RuntimeError(f"Missing required config keys: {sorted(missing)}")

    if int(cfg["seq_len"]) != SEQ_LEN or int(cfg["pred_len"]) != PRED_LEN or int(cfg["label_len"]) != LABEL_LEN:
        raise RuntimeError(
            "Config seq/label/pred lengths do not match fixed API contract "
            f"({SEQ_LEN}, {LABEL_LEN}, {PRED_LEN})"
        )
    if int(cfg["enc_in"]) != len(COMMUNITY_IDS):
        raise RuntimeError(f"enc_in must be {len(COMMUNITY_IDS)}")

    cfg.setdefault("embed", "timeF")
    cfg.setdefault("freq", "d")
    cfg.setdefault("activation", "gelu")
    cfg.setdefault("use_norm", True)
    cfg.setdefault("output_attention", False)
    cfg.setdefault("channel_independence", False)
    cfg.setdefault("rnn_layers", 2)
    return cfg


def _load_scaler(scaler_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    payload = np.load(scaler_path)
    if "mean" not in payload or "std" not in payload:
        raise RuntimeError("scaler.npz must include 'mean' and 'std'")

    mean = np.asarray(payload["mean"], dtype=np.float32)
    std = np.asarray(payload["std"], dtype=np.float32)
    if mean.shape != (len(COMMUNITY_IDS),) or std.shape != (len(COMMUNITY_IDS),):
        raise RuntimeError(
            f"mean/std must each have shape ({len(COMMUNITY_IDS)},), got {mean.shape}/{std.shape}"
        )

    if "community_ids" in payload:
        community_ids = np.asarray(payload["community_ids"], dtype=np.int32)
    else:
        community_ids = np.asarray(COMMUNITY_IDS, dtype=np.int32)

    if community_ids.shape != (len(COMMUNITY_IDS),):
        raise RuntimeError(f"community_ids must have shape ({len(COMMUNITY_IDS)},)")
    if not np.array_equal(community_ids, np.asarray(COMMUNITY_IDS, dtype=np.int32)):
        raise RuntimeError("community_ids must be ordered 1..77")

    return mean, std, community_ids


class RuntimeRegistry:
    def __init__(self, models_dir: Path = PRED_MODELS_DIR):
        self.models_dir = models_dir
        self.device = resolve_device()
        self._cache: dict[str, ModelBundle] = {}

    def _checkpoint_dir(self, model_name: str) -> Path:
        return (self.models_dir / model_name / "checkpoint").resolve()

    def _load_bundle(self, model_name: str) -> ModelBundle:
        ckpt_dir = self._checkpoint_dir(model_name)
        checkpoint_path = ckpt_dir / "checkpoint.pth"
        config_path = ckpt_dir / "model_config.json"
        scaler_path = ckpt_dir / "scaler.npz"

        for p in (checkpoint_path, config_path, scaler_path):
            if not p.exists():
                raise FileNotFoundError(f"Missing artifact: {p}")

        cfg = _load_config(config_path)
        mean, std, community_ids = _load_scaler(scaler_path)

        model_type = str(cfg["model_type"])
        model = build_model(model_type, cfg).to(self.device)

        state_obj = torch.load(checkpoint_path, map_location=self.device)
        state_dict = _extract_state_dict(state_obj)
        state_dict = _strip_module_prefix(state_dict)
        state_dict = _normalize_legacy_state_dict_keys(state_dict)
        state_dict = _filter_to_model_keys(state_dict, model)
        if not state_dict:
            raise RuntimeError("No compatible parameters found in checkpoint for the configured model")

        missing, unexpected = model.load_state_dict(state_dict, strict=False)
        if missing:
            raise RuntimeError(f"Checkpoint missing parameters: {missing[:5]}...")
        if unexpected:
            raise RuntimeError(f"Checkpoint has unexpected parameters: {unexpected[:5]}...")

        model.eval()
        return ModelBundle(
            model_name=model_name,
            model_type=model_type,
            cfg=cfg,
            model=model,
            device=self.device,
            mean=mean,
            std=std,
            community_ids=community_ids,
        )

    def get(self, model_name: str) -> ModelBundle:
        if model_name not in self._cache:
            self._cache[model_name] = self._load_bundle(model_name)
        return self._cache[model_name]
