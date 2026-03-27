from __future__ import annotations

from types import SimpleNamespace

from backend.prediction.models.gru_model import GRUModel
from backend.prediction.models.itransformer_model import ITransformerModel
from backend.prediction.models.transformer_model import TransformerModel


def build_model(model_type: str, cfg: dict):
    ns = SimpleNamespace(**cfg)
    name = model_type.strip()
    if name == "Transformer":
        return TransformerModel(ns)
    if name == "iTransformer":
        return ITransformerModel(ns)
    if name == "GRU":
        return GRUModel(ns)
    raise ValueError(f"Unsupported model_type '{model_type}'")
