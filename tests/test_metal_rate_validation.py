from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.modules.metal_rates.schemas import MetalRateCreate


@pytest.mark.parametrize("rate", [Decimal("0"), Decimal("-0.01")])
def test_metal_rate_must_be_positive(rate: Decimal) -> None:
    with pytest.raises(ValidationError):
        MetalRateCreate(
            metal="gold",
            purity=Decimal("100"),
            rate_per_gram=rate,
        )


@pytest.mark.parametrize("purity", [Decimal("0"), Decimal("-1"), Decimal("100.01")])
def test_metal_rate_purity_stays_within_percentage_range(purity: Decimal) -> None:
    with pytest.raises(ValidationError):
        MetalRateCreate(
            metal="gold",
            purity=purity,
            rate_per_gram=Decimal("7000"),
        )
