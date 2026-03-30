from __future__ import annotations

import torch
import torch.nn as nn


class GRUModel(nn.Module):
    def __init__(self, configs):
        super().__init__()
        self.pred_len = configs.pred_len
        self.output_attention = bool(getattr(configs, "output_attention", False))
        self.use_norm = bool(getattr(configs, "use_norm", False))

        if bool(getattr(configs, "channel_independence", False)):
            self.enc_in = 1
            self.c_out = 1
        else:
            self.enc_in = configs.enc_in
            self.c_out = configs.c_out

        hidden_size = int(getattr(configs, "d_model", 128))
        num_layers = int(getattr(configs, "rnn_layers", 2))
        dropout = float(getattr(configs, "dropout", 0.0)) if num_layers > 1 else 0.0

        self.gru = nn.GRU(
            input_size=self.enc_in,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout,
        )

        if bool(getattr(configs, "channel_independence", False)):
            self.proj = nn.Linear(hidden_size, self.pred_len, bias=True)
        else:
            self.proj = nn.Linear(hidden_size, self.pred_len * self.c_out, bias=True)

    def forward(self, x_enc, x_mark_enc, x_dec, x_mark_dec, mask=None):
        if self.use_norm:
            means = x_enc.mean(1, keepdim=True).detach()
            x_enc = x_enc - means
            stdev = torch.sqrt(torch.var(x_enc, dim=1, keepdim=True, unbiased=False) + 1e-5)
            x_enc = x_enc / stdev
        else:
            means, stdev = None, None

        batch_size, seq_len, n_vars = x_enc.shape

        if self.enc_in == 1:
            x = x_enc.permute(0, 2, 1).contiguous().view(batch_size * n_vars, seq_len, 1)
            _, h_n = self.gru(x)
            last_hidden = h_n[-1]
            pred = self.proj(last_hidden)
            pred = pred.view(batch_size, n_vars, self.pred_len).permute(0, 2, 1).contiguous()
        else:
            _, h_n = self.gru(x_enc)
            last_hidden = h_n[-1]
            pred = self.proj(last_hidden)
            pred = pred.view(batch_size, self.pred_len, self.c_out)

        if self.use_norm and means is not None and stdev is not None:
            pred = pred * (stdev[:, 0, :].unsqueeze(1).repeat(1, self.pred_len, 1))
            pred = pred + (means[:, 0, :].unsqueeze(1).repeat(1, self.pred_len, 1))

        if self.output_attention:
            return pred, None
        return pred
