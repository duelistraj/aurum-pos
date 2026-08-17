from app.modules.items.export import (
    INVENTORY_EXPORT_FIELDS,
    INVENTORY_EXPORT_FORMAT,
    _spreadsheet_safe,
)


def test_inventory_export_is_a_standalone_native_inventory_contract() -> None:
    assert INVENTORY_EXPORT_FORMAT == "aurum-pos-inventory-csv-v1"
    assert INVENTORY_EXPORT_FIELDS == (
        "export_format",
        "exported_at",
        "shop_id",
        "shop_slug",
        "item_id",
        "sku",
        "barcode",
        "name",
        "category",
        "item_type",
        "metal",
        "purity",
        "pricing_method",
        "stock_mode",
        "net_weight_grams",
        "making_charge",
        "fixed_rate",
        "stock_weight_grams",
        "ratti",
        "rate_per_ratti",
        "quantity",
        "status",
        "notes",
        "created_at",
        "updated_at",
        "price_state",
        "subtotal",
        "gst_rate_percent",
        "final_unit_price",
    )


def test_inventory_export_escapes_spreadsheet_formulas() -> None:
    assert _spreadsheet_safe("=SUM(1,1)") == "'=SUM(1,1)"
    assert _spreadsheet_safe("safe value") == "safe value"
