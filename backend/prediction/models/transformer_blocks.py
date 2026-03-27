from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class EncoderLayer(nn.Module):
    def __init__(self, attention: nn.Module, d_model: int, d_ff: int | None = None, dropout: float = 0.1, activation: str = "relu"):
        super().__init__()
        d_ff = d_ff or (4 * d_model)
        self.attention = attention
        self.conv1 = nn.Conv1d(in_channels=d_model, out_channels=d_ff, kernel_size=1)
        self.conv2 = nn.Conv1d(in_channels=d_ff, out_channels=d_model, kernel_size=1)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
        self.activation = F.relu if activation == "relu" else F.gelu

    def forward(self, x: torch.Tensor, attn_mask=None):
        new_x, attn = self.attention(x, x, x, attn_mask=attn_mask)
        x = x + self.dropout(new_x)

        y = x = self.norm1(x)
        y = self.dropout(self.activation(self.conv1(y.transpose(-1, 1))))
        y = self.dropout(self.conv2(y).transpose(-1, 1))

        return self.norm2(x + y), attn


class Encoder(nn.Module):
    def __init__(self, attn_layers: list[nn.Module], norm_layer: nn.Module | None = None):
        super().__init__()
        self.attn_layers = nn.ModuleList(attn_layers)
        self.norm = norm_layer

    def forward(self, x: torch.Tensor, attn_mask=None):
        attns = []
        for attn_layer in self.attn_layers:
            x, attn = attn_layer(x, attn_mask=attn_mask)
            attns.append(attn)

        if self.norm is not None:
            x = self.norm(x)

        return x, attns


class DecoderLayer(nn.Module):
    def __init__(self, self_attention: nn.Module, cross_attention: nn.Module, d_model: int, d_ff: int | None = None, dropout: float = 0.1, activation: str = "relu"):
        super().__init__()
        d_ff = d_ff or (4 * d_model)
        self.self_attention = self_attention
        self.cross_attention = cross_attention
        self.conv1 = nn.Conv1d(in_channels=d_model, out_channels=d_ff, kernel_size=1)
        self.conv2 = nn.Conv1d(in_channels=d_ff, out_channels=d_model, kernel_size=1)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.norm3 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
        self.activation = F.relu if activation == "relu" else F.gelu

    def forward(self, x: torch.Tensor, cross: torch.Tensor, x_mask=None, cross_mask=None):
        self_attn_out, self_attn = self.self_attention(x, x, x, attn_mask=x_mask)
        x = self.norm1(x + self.dropout(self_attn_out))

        cross_attn_out, cross_attn = self.cross_attention(x, cross, cross, attn_mask=cross_mask)
        x = x + self.dropout(cross_attn_out)

        y = x = self.norm2(x)
        y = self.dropout(self.activation(self.conv1(y.transpose(-1, 1))))
        y = self.dropout(self.conv2(y).transpose(-1, 1))

        return self.norm3(x + y), self_attn, cross_attn


class Decoder(nn.Module):
    def __init__(self, layers: list[nn.Module], norm_layer: nn.Module | None = None, projection: nn.Module | None = None):
        super().__init__()
        self.layers = nn.ModuleList(layers)
        self.norm = norm_layer
        self.projection = projection

    def forward(self, x: torch.Tensor, cross: torch.Tensor, x_mask=None, cross_mask=None):
        self_attns = []
        cross_attns = []
        for layer in self.layers:
            x, self_attn, cross_attn = layer(x, cross, x_mask=x_mask, cross_mask=cross_mask)
            self_attns.append(self_attn)
            cross_attns.append(cross_attn)

        if self.norm is not None:
            x = self.norm(x)

        if self.projection is not None:
            x = self.projection(x)

        return x, self_attns, cross_attns
