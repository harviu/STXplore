from __future__ import annotations

import torch
import torch.nn as nn

from backend.prediction.models.attention import AttentionLayer, FullAttention
from backend.prediction.models.embedding import DataEmbedding
from backend.prediction.models.transformer_blocks import Decoder, DecoderLayer, Encoder, EncoderLayer


class TransformerModel(nn.Module):
    def __init__(self, configs):
        super().__init__()
        self.pred_len = configs.pred_len
        self.output_attention = bool(getattr(configs, "output_attention", False))

        if bool(getattr(configs, "channel_independence", False)):
            enc_in = 1
            dec_in = 1
            c_out = 1
        else:
            enc_in = configs.enc_in
            dec_in = configs.dec_in
            c_out = configs.c_out

        self.enc_embedding = DataEmbedding(enc_in, configs.d_model, getattr(configs, "embed", "timeF"), getattr(configs, "freq", "d"), configs.dropout)
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

        self.dec_embedding = DataEmbedding(dec_in, configs.d_model, getattr(configs, "embed", "timeF"), getattr(configs, "freq", "d"), configs.dropout)
        self.decoder = Decoder(
            [
                DecoderLayer(
                    AttentionLayer(
                        FullAttention(True, attention_dropout=configs.dropout, output_attention=self.output_attention),
                        configs.d_model,
                        configs.n_heads,
                    ),
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
                for _ in range(configs.d_layers)
            ],
            norm_layer=nn.LayerNorm(configs.d_model),
            projection=nn.Linear(configs.d_model, c_out, bias=True),
        )

    def forecast(self, x_enc, x_mark_enc, x_dec, x_mark_dec):
        enc_out = self.enc_embedding(x_enc, x_mark_enc)
        enc_out, enc_attns = self.encoder(enc_out, attn_mask=None)

        dec_out = self.dec_embedding(x_dec, x_mark_dec)
        dec_out, dec_self_attns, dec_cross_attns = self.decoder(dec_out, enc_out, x_mask=None, cross_mask=None)

        if self.output_attention:
            enc_attns = torch.stack(enc_attns).permute(1, 0, 2, 3, 4)
            dec_self_attns = torch.stack(dec_self_attns).permute(1, 0, 2, 3, 4)
            dec_cross_attns = torch.stack(dec_cross_attns).permute(1, 0, 2, 3, 4)
        else:
            enc_attns, dec_self_attns, dec_cross_attns = None, None, None

        return dec_out, enc_attns, dec_self_attns, dec_cross_attns

    def forward(self, x_enc, x_mark_enc, x_dec, x_mark_dec, mask=None):
        dec_out, enc_attns, dec_self_attns, dec_cross_attns = self.forecast(x_enc, x_mark_enc, x_dec, x_mark_dec)
        if self.output_attention:
            return dec_out[:, -self.pred_len :, :], (enc_attns, dec_self_attns, dec_cross_attns)
        return dec_out[:, -self.pred_len :, :]
