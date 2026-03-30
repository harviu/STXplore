from __future__ import annotations

import torch


class TriangularCausalMask:
    def __init__(self, batch_size: int, length: int, device: str | torch.device = "cpu"):
        mask_shape = (batch_size, 1, length, length)
        with torch.no_grad():
            self._mask = torch.triu(torch.ones(mask_shape, dtype=torch.bool), diagonal=1).to(device)

    @property
    def mask(self) -> torch.Tensor:
        return self._mask
