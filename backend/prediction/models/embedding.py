from __future__ import annotations

import math

import torch
import torch.nn as nn


class PositionalEmbedding(nn.Module):
    def __init__(self, d_model: int, max_len: int = 5000):
        super().__init__()
        pe = torch.zeros(max_len, d_model).float()
        pe.requires_grad = False

        position = torch.arange(0, max_len).float().unsqueeze(1)
        div_term = (torch.arange(0, d_model, 2).float() * -(math.log(10000.0) / d_model)).exp()

        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)

        pe = pe.unsqueeze(0)
        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.pe[:, : x.size(1)]


class TokenEmbedding(nn.Module):
    def __init__(self, c_in: int, d_model: int):
        super().__init__()
        padding = 1 if torch.__version__ >= "1.5.0" else 2
        self.token_conv = nn.Conv1d(
            in_channels=c_in,
            out_channels=d_model,
            kernel_size=3,
            padding=padding,
            padding_mode="circular",
            bias=False,
        )
        for module in self.modules():
            if isinstance(module, nn.Conv1d):
                nn.init.kaiming_normal_(module.weight, mode="fan_in", nonlinearity="leaky_relu")

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.token_conv(x.permute(0, 2, 1)).transpose(1, 2)


class TemporalEmbedding(nn.Module):
    def __init__(self, d_model: int, freq: str = "h"):
        super().__init__()
        minute_size = 4
        hour_size = 24
        weekday_size = 7
        day_size = 32
        month_size = 13

        if freq == "t":
            self.minute_embed = nn.Embedding(minute_size, d_model)
        self.hour_embed = nn.Embedding(hour_size, d_model)
        self.weekday_embed = nn.Embedding(weekday_size, d_model)
        self.day_embed = nn.Embedding(day_size, d_model)
        self.month_embed = nn.Embedding(month_size, d_model)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x.long()
        minute_x = self.minute_embed(x[:, :, 4]) if hasattr(self, "minute_embed") else 0.0
        hour_x = self.hour_embed(x[:, :, 3])
        weekday_x = self.weekday_embed(x[:, :, 2])
        day_x = self.day_embed(x[:, :, 1])
        month_x = self.month_embed(x[:, :, 0])
        return hour_x + weekday_x + day_x + month_x + minute_x


class TimeFeatureEmbedding(nn.Module):
    def __init__(self, d_model: int, freq: str = "h"):
        super().__init__()
        freq_map = {"h": 4, "t": 5, "s": 6, "m": 1, "a": 1, "w": 2, "d": 3, "b": 3}
        d_inp = freq_map[freq]
        self.embed = nn.Linear(d_inp, d_model, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.embed(x)


class DataEmbedding(nn.Module):
    def __init__(self, c_in: int, d_model: int, embed_type: str = "timeF", freq: str = "h", dropout: float = 0.1):
        super().__init__()
        self.value_embedding = TokenEmbedding(c_in=c_in, d_model=d_model)
        self.position_embedding = PositionalEmbedding(d_model=d_model)
        if embed_type == "timeF":
            self.temporal_embedding = TimeFeatureEmbedding(d_model=d_model, freq=freq)
        else:
            self.temporal_embedding = TemporalEmbedding(d_model=d_model, freq=freq)
        self.dropout = nn.Dropout(p=dropout)

    def forward(self, x: torch.Tensor, x_mark: torch.Tensor | None) -> torch.Tensor:
        if x_mark is None:
            out = self.value_embedding(x) + self.position_embedding(x)
        else:
            out = self.value_embedding(x) + self.temporal_embedding(x_mark) + self.position_embedding(x)
        return self.dropout(out)


class DataEmbeddingInverted(nn.Module):
    def __init__(self, c_in: int, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.value_embedding = nn.Linear(c_in, d_model)
        self.dropout = nn.Dropout(p=dropout)

    def forward(self, x: torch.Tensor, x_mark: torch.Tensor | None) -> torch.Tensor:
        x = x.permute(0, 2, 1)
        if x_mark is None:
            out = self.value_embedding(x)
        else:
            out = self.value_embedding(torch.cat([x, x_mark.permute(0, 2, 1)], dim=1))
        return self.dropout(out)
