from decimal import Decimal

from app.modules.items.pricing import calculate_suggested_price, lock_price_at_sale
from app.modules.items.schemas import ItemUpdate
from app.modules.metal_rates.service import calculate_effective_rate_per_gram


def test_price_calculation_uses_decimal_and_half_up_rounding() -> None:
    pricing = lock_price_at_sale(
        metal="silver",
        category="jewellery",
        purity=Decimal("92.5"),
        net_weight=Decimal("1.005"),
        rate_per_gram=Decimal("100.00"),
        making_charge=Decimal("10.00"),
    )

    assert pricing["effective_purity"] == Decimal("100")
    assert pricing["metal_value"] == Decimal("100.50")
    assert pricing["making_charge"] == Decimal("10.05")
    assert pricing["gst_amount"] == Decimal("3.32")
    assert pricing["final_price"] == Decimal("113.87")


def test_unique_item_price_is_only_the_fixed_making_charge() -> None:
    pricing = calculate_suggested_price(
        category="unique",
        net_weight=0,
        rate_per_gram=500,
        making_charge=Decimal("1250.555"),
    )
    assert pricing["metal_value"] == Decimal("0.00")
    assert pricing["suggested_price"] == Decimal("1250.56")


def test_item_update_is_partial() -> None:
    update = ItemUpdate(name="Updated name")
    assert update.model_dump(exclude_unset=True) == {"name": "Updated name"}


def test_gold_rate_is_converted_from_the_100_percent_base_rate() -> None:
    rate = calculate_effective_rate_per_gram(
        metal="Gold",
        purity=Decimal("91.6"),
        base_rate_per_gram=Decimal("7000"),
    )

    assert rate == Decimal("6412")


def test_platinum_rate_is_converted_from_the_100_percent_base_rate() -> None:
    rate = calculate_effective_rate_per_gram(
        metal="Platinum",
        purity=Decimal("95"),
        base_rate_per_gram=Decimal("4000"),
    )

    assert rate == Decimal("3800")


def test_silver_rate_ignores_item_purity() -> None:
    rate = calculate_effective_rate_per_gram(
        metal="Silver",
        purity=Decimal("92.5"),
        base_rate_per_gram=Decimal("100"),
    )

    assert rate == Decimal("100")
