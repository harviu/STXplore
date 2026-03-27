from __future__ import annotations

from math import sqrt

import numpy as np
import torch
import torch.nn as nn

from backend.prediction.models.masking import TriangularCausalMask


class FullAttention(nn.Module):
    def __init__(self, mask_flag: bool = True, scale: float | None = None, attention_dropout: float = 0.1, output_attention: bool = False):
        super().__init__()
        self.scale = scale
        self.mask_flag = mask_flag
        self.output_attention = output_attention
        self.dropout = nn.Dropout(attention_dropout)

    def forward(self, queries: torch.Tensor, keys: torch.Tensor, values: torch.Tensor, attn_mask: TriangularCausalMask | None):
        batch_size, length_q, n_heads, dim = queries.shape
        scale = self.scale or (1.0 / sqrt(dim))

        scores = torch.einsum("blhe,bshe->bhls", queries, keys)

        if self.mask_flag:
            if attn_mask is None:
                attn_mask = TriangularCausalMask(batch_size, length_q, device=queries.device)
            scores = scores.masked_fill(attn_mask.mask, -np.inf)

        attn = self.dropout(torch.softmax(scale * scores, dim=-1))
        out = torch.einsum("bhls,bshd->blhd", attn, values)

        if self.output_attention:
            return out.contiguous(), attn
        return out.contiguous(), None


class AttentionLayer(nn.Module):
    def __init__(self, attention: FullAttention, d_model: int, n_heads: int, d_keys: int | None = None, d_values: int | None = None):
        super().__init__()
        d_keys = d_keys or (d_model // n_heads)
        d_values = d_values or (d_model // n_heads)

        self.inner_attention = attention
        self.query_projection = nn.Linear(d_model, d_keys * n_heads)
        self.key_projection = nn.Linear(d_model, d_keys * n_heads)
        self.value_projection = nn.Linear(d_model, d_values * n_heads)
        self.out_projection = nn.Linear(d_values * n_heads, d_model)
        self.n_heads = n_heads

    def forward(self, queries: torch.Tensor, keys: torch.Tensor, values: torch.Tensor, attn_mask: TriangularCausalMask | None):
        batch_size, length_q, _ = queries.shape
        _, length_k, _ = keys.shape
        n_heads = self.n_heads

        q = self.query_projection(queries).view(batch_size, length_q, n_heads, -1)
        k = self.key_projection(keys).view(batch_size, length_k, n_heads, -1)
        v = self.value_projection(values).view(batch_size, length_k, n_heads, -1)

        out, attn = self.inner_attention(q, k, v, attn_mask)
        out = out.view(batch_size, length_q, -1)
        return self.out_projection(out), attn
