from decimal import Decimal

import pytest

from app.modules.items.catalog import format_category_name
from app.modules.items.pricing import calculate_suggested_price, lock_price_at_sale
from app.modules.items.schemas import ItemBase, ItemCreate, ItemUpdate
from app.modules.items.service import reconcile_remaining_weight
from app.modules.items.tax import get_tax_profile
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


def test_earrings_category_is_canonicalized_for_create_update_and_display() -> None:
    item = ItemCreate(
        sku="EARRING-1",
        category="Earrings",
        name="Gold earring",
        metal="Gold",
        purity=91.6,
        net_weight=2,
        making_charge=100,
    )
    update = ItemUpdate(category="Earrings")

    assert item.category == "earring"
    assert update.category == "earring"
    assert format_category_name("earrings") == "Earring"
    assert format_category_name("nose-pin") == "Nose Pin"


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


@pytest.mark.parametrize(
    ("pricing_method", "expected_making"),
    (("fixed_making_charge", Decimal("10.00")), ("making_charge_per_gram", Decimal("20.00"))),
)
def test_pricing_method_is_independent_of_category(
    pricing_method: str,
    expected_making: Decimal,
) -> None:
    pricing = lock_price_at_sale(
        metal="gold",
        category="ring",
        pricing_method=pricing_method,
        purity=100,
        net_weight=2,
        rate_per_gram=100,
        making_charge=10,
    )

    assert pricing["making_charge"] == expected_making


def test_stone_price_and_tax_come_from_ratti_and_category() -> None:
    pricing = lock_price_at_sale(
        metal="stone",
        category="neelam",
        item_type="stone",
        pricing_method="rate_per_ratti",
        purity=0,
        net_weight=0,
        rate_per_gram=0,
        making_charge=0,
        ratti=Decimal("2.500"),
        rate_per_ratti=Decimal("1000"),
    )

    assert pricing["subtotal"] == Decimal("2500.00")
    assert pricing["hsn"] == "7103"
    assert pricing["gst_rate_percent"] == Decimal("3.00")
    assert pricing["final_price"] == Decimal("2575.00")


def test_weighted_item_derives_internal_quantity_and_rejects_fixed_rate() -> None:
    item = ItemCreate(
        sku="WEIGHT-1",
        category="chain",
        item_type="jewellery",
        pricing_method="making_charge_per_gram",
        stock_mode="weight",
        name="Chain lot",
        metal="gold",
        purity=91.6,
        stock_weight=Decimal("50.125"),
        making_charge=100,
        quantity=99,
    )
    assert item.quantity == 1
    assert item.net_weight == Decimal("50.125")
    assert item.stock_weight == Decimal("50.125")

    total_only = ItemCreate(
        sku="WEIGHT-TOTAL",
        category="chain",
        item_type="jewellery",
        pricing_method="making_charge_per_gram",
        stock_mode="weight",
        name="Total-only chain lot",
        metal="gold",
        purity=91.6,
        net_weight=Decimal("25.750"),
        making_charge=100,
    )
    assert total_only.stock_weight == Decimal("25.750")

    with pytest.raises(ValueError, match="Fixed rate is not available"):
        ItemCreate(
            sku="WEIGHT-2",
            category="chain",
            item_type="jewellery",
            pricing_method="fixed_rate",
            stock_mode="weight",
            name="Fixed chain lot",
            metal="gold",
            purity=91.6,
            stock_weight=10,
            fixed_rate=1000,
        )


def test_weighted_total_edit_preserves_consumed_weight() -> None:
    assert reconcile_remaining_weight(
        current_total=Decimal("50"),
        current_remaining=Decimal("37.5"),
        new_total=Decimal("55"),
    ) == Decimal("42.5")
    assert (
        reconcile_remaining_weight(
            current_total=Decimal("50"),
            current_remaining=Decimal("37.5"),
            new_total=Decimal("12.5"),
        )
        == 0
    )

    with pytest.raises(ValueError, match="less than consumed weight"):
        reconcile_remaining_weight(
            current_total=Decimal("50"),
            current_remaining=Decimal("37.5"),
            new_total=Decimal("12.499"),
        )


def test_weighted_snapshot_preserves_a_partial_remaining_balance() -> None:
    item = ItemBase(
        sku="WEIGHT-PARTIAL",
        category="chain",
        item_type="jewellery",
        pricing_method="making_charge_per_gram",
        stock_mode="weight",
        name="Partially consumed chain lot",
        metal="gold",
        purity=91.6,
        net_weight=50,
        stock_weight=37.5,
        making_charge=100,
    )

    assert item.net_weight == Decimal("50")
    assert item.stock_weight == Decimal("37.5")
    assert item.quantity == 1

    with pytest.raises(ValueError, match="between 0 and total weight"):
        ItemBase(
            sku="WEIGHT-INVALID",
            category="chain",
            item_type="jewellery",
            pricing_method="making_charge_per_gram",
            stock_mode="weight",
            name="Invalid chain lot",
            metal="gold",
            purity=91.6,
            net_weight=50,
            stock_weight=51,
            making_charge=100,
        )


@pytest.mark.parametrize(
    ("category", "expected_hsn"),
    (("moti", "7101"), ("other", "7103"), ("heera", "7103"), ("moonga", "7103")),
)
def test_stone_tax_is_derived_from_category(category: str, expected_hsn: str) -> None:
    tax = get_tax_profile(metal="stone", category=category, item_type="stone")

    assert tax["hsn"] == expected_hsn
    assert tax["gst_rate_percent"] == Decimal("3.00")


def test_item_notes_are_limited_to_50_characters() -> None:
    assert ItemUpdate(notes="x" * 50).notes == "x" * 50
    with pytest.raises(ValueError, match="50 characters"):
        ItemUpdate(notes="x" * 51)
