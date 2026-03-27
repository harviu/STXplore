from __future__ import annotations

import torch
import torch.nn as nn

from backend.prediction.models.attention import AttentionLayer, FullAttention
from backend.prediction.models.embedding import DataEmbeddingInverted
from backend.prediction.models.transformer_blocks import Encoder, EncoderLayer


class ITransformerModel(nn.Module):
    def __init__(self, configs):
        super().__init__()
        self.pred_len = configs.pred_len
        self.output_attention = bool(getattr(configs, "output_attention", False))
        self.use_norm = bool(getattr(configs, "use_norm", True))

        self.enc_embedding = DataEmbeddingInverted(configs.seq_len, configs.d_model, configs.dropout)
        self.encoder = Encoder(
            [
                EncoderLayer(
                    AttentionLayer(
                        FullAttention(False, attention_dropout=configs.dropout, output_attention=self.output_attention),
                        configs.d_model,
                        configs.n_heads,
                    ),
                    configs.d_model,
                    configs.d_ff,
                    dropout=configs.dropout,
                    activation=getattr(configs, "activation", "gelu"),
                )
                for _ in range(configs.e_layers)
            ],
            norm_layer=nn.LayerNorm(configs.d_model),
        )
        self.projector = nn.Linear(configs.d_model, configs.pred_len, bias=True)

    def forecast(self, x_enc, x_mark_enc, x_dec, x_mark_dec):
        if self.use_norm:
            means = x_enc.mean(1, keepdim=True).detach()
            x_enc = x_enc - means
            stdev = torch.sqrt(torch.var(x_enc, dim=1, keepdim=True, unbiased=False) + 1e-5)
            x_enc = x_enc / stdev
        else:
            means, stdev = None, None

        _, _, n_vars = x_enc.shape
        enc_out = self.enc_embedding(x_enc, x_mark_enc)
        enc_out, attns = self.encoder(enc_out, attn_mask=None)

        dec_out = self.projector(enc_out).permute(0, 2, 1)[:, :, :n_vars]

        if self.use_norm and means is not None and stdev is not None:
            dec_out = dec_out * (stdev[:, 0, :].unsqueeze(1).repeat(1, self.pred_len, 1))
            dec_out = dec_out + (means[:, 0, :].unsqueeze(1).repeat(1, self.pred_len, 1))

        if self.output_attention:
            attns = torch.stack(attns).permute(1, 0, 2, 3, 4)
        else:
            attns = None

        return dec_out, attns

    def forward(self, x_enc, x_mark_enc, x_dec, x_mark_dec, mask=None):
        dec_out, attns = self.forecast(x_enc, x_mark_enc, x_dec, x_mark_dec)
        if self.output_attention:
            return dec_out[:, -self.pred_len :, :], (attns,)
        return dec_out[:, -self.pred_len :, :]
