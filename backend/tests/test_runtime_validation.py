import json
from pathlib import Path

import numpy as np

from backend.prediction.runtime import _load_config, _load_scaler


def test_load_config_requires_fixed_lengths(tmp_path: Path):
    cfg = {
        "model_type": "GRU",
        "seq_len": 90,
        "label_len": 45,
        "pred_len": 30,
        "enc_in": 77,
        "dec_in": 77,
        "c_out": 77,
        "d_model": 512,
        "d_ff": 512,
        "e_layers": 4,
        "d_layers": 1,
        "n_heads": 8,
        "dropout": 0.1,
    }
    p = tmp_path / "model_config.json"
    p.write_text(json.dumps(cfg))

    loaded = _load_config(p)
    assert loaded["model_type"] == "GRU"
    assert loaded["freq"] == "d"


def test_load_scaler_validates_shapes(tmp_path: Path):
    scaler_path = tmp_path / "scaler.npz"
    np.savez(
        scaler_path,
        mean=np.zeros(77, dtype=np.float32),
        std=np.ones(77, dtype=np.float32),
        community_ids=np.arange(1, 78, dtype=np.int32),
    )

    mean, std, community_ids = _load_scaler(scaler_path)
    assert mean.shape == (77,)
    assert std.shape == (77,)
    assert community_ids.shape == (77,)


def test_load_scaler_rejects_bad_community_order(tmp_path: Path):
    scaler_path = tmp_path / "scaler.npz"
    np.savez(
        scaler_path,
        mean=np.zeros(77, dtype=np.float32),
        std=np.ones(77, dtype=np.float32),
        community_ids=np.arange(2, 79, dtype=np.int32),
    )

    try:
        _load_scaler(scaler_path)
        assert False, "Expected RuntimeError for invalid community_ids order"
    except RuntimeError as exc:
        assert "community_ids" in str(exc)
