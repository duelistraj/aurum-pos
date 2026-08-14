from decimal import Decimal

import pytest

from app.modules.items.pricing import calculate_suggested_price, lock_price_at_sale
from app.modules.items.schemas import ItemCreate, ItemUpdate
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


def test_other_category_uses_fixed_making_charge_and_the_shop_tax_rate() -> None:
    pricing = lock_price_at_sale(
        metal="gold",
        category="other",
        purity=100,
        net_weight=2,
        rate_per_gram=100,
        making_charge=10,
        tax_rate_percent=5,
    )

    assert pricing["metal_value"] == Decimal("200.00")
    assert pricing["making_charge"] == Decimal("10.00")
    assert pricing["gst_rate_percent"] == Decimal("5")
    assert pricing["gst_amount"] == Decimal("10.50")
    assert pricing["final_price"] == Decimal("220.50")


@pytest.mark.parametrize("category", ("ring", "pendant"))
def test_ring_and_pendant_use_per_weight_making_charge(category: str) -> None:
    pricing = lock_price_at_sale(
        metal="gold",
        category=category,
        purity=100,
        net_weight=2,
        rate_per_gram=100,
        making_charge=10,
        tax_rate_percent=5,
    )

    assert pricing["metal_value"] == Decimal("200.00")
    assert pricing["making_charge"] == Decimal("20.00")
    assert pricing["subtotal"] == Decimal("220.00")
    assert pricing["gst_amount"] == Decimal("11.00")
    assert pricing["final_price"] == Decimal("231.00")


def test_unique_item_legacy_price_maps_to_fixed_rate() -> None:
    pricing = calculate_suggested_price(
        category="unique",
        net_weight=0,
        rate_per_gram=500,
        making_charge=Decimal("1250.555"),
    )
    assert pricing["metal_value"] == Decimal("0.00")
    assert pricing["making_charge"] == Decimal("0.00")
    assert pricing["fixed_rate"] == Decimal("1250.56")
    assert pricing["suggested_price"] == Decimal("1250.56")


def test_unique_item_fixed_rate_receives_shop_tax() -> None:
    pricing = lock_price_at_sale(
        metal="silver",
        category="unique",
        purity=0,
        net_weight=0,
        rate_per_gram=0,
        making_charge=0,
        fixed_rate=1000,
        tax_rate_percent=3,
    )

    assert pricing["metal_value"] == Decimal("0.00")
    assert pricing["making_charge"] == Decimal("0.00")
    assert pricing["fixed_rate"] == Decimal("1000.00")
    assert pricing["gst_amount"] == Decimal("30.00")
    assert pricing["final_price"] == Decimal("1030.00")


def test_unique_item_payload_normalizes_legacy_making_charge_to_fixed_rate() -> None:
    item = ItemCreate(
        sku="UNIQUE-1",
        category="Unique",
        name="Fixed price necklace",
        metal="Silver",
        purity=92.5,
        net_weight=12,
        making_charge=850,
    )

    assert item.category == "unique"
    assert item.net_weight == 0
    assert item.making_charge == 0
    assert item.fixed_rate == 850


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
