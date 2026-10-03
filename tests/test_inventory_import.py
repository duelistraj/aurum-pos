import csv
from io import StringIO

import pytest

from app.modules.items.importer import (
    INVENTORY_IMPORT_FIELDS,
    InventoryImportValidationError,
    build_inventory_import_template,
    parse_inventory_csv,
)


def _csv_document(rows: list[dict[str, object]], *, extra_fields: tuple[str, ...] = ()) -> bytes:
    output = StringIO(newline="")
    fieldnames = (*INVENTORY_IMPORT_FIELDS, *extra_fields)
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    return ("\ufeff" + output.getvalue()).encode()


def _jewellery_row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "sku": "RING-1",
        "barcode": "12345678",
        "name": "Silver Ring",
        "category": "ring",
        "item_type": "jewellery",
        "pricing_method": "making_charge_per_gram",
        "stock_mode": "quantity",
        "metal": "silver",
        "purity": "92.5",
        "quantity": "2",
        "net_weight_grams": "4.5",
        "making_charge": "100",
        "fixed_rate": "",
        "stock_weight_grams": "",
        "ratti": "",
        "rate_per_ratti": "",
        "notes": "",
    }
    row.update(overrides)
    return row


def test_inventory_import_template_has_the_dedicated_contract() -> None:
    decoded = build_inventory_import_template().decode("utf-8-sig")
    assert next(csv.reader(StringIO(decoded))) == list(INVENTORY_IMPORT_FIELDS)


def test_inventory_import_validates_jewellery_stones_and_partial_weight() -> None:
    parsed = parse_inventory_csv(
        _csv_document(
            [
                _jewellery_row(),
                _jewellery_row(
                    sku="CHAIN-1",
                    barcode="",
                    name="Gold Chain",
                    metal="gold",
                    purity="91.6",
                    stock_mode="weight",
                    quantity="",
                    net_weight_grams="10",
                    stock_weight_grams="6.25",
                ),
                _jewellery_row(
                    sku="STONE-1",
                    barcode="87654321",
                    name="Blue Sapphire",
                    category="neelam",
                    item_type="stone",
                    pricing_method="rate_per_ratti",
                    stock_mode="quantity",
                    metal="stone",
                    purity="",
                    quantity="3",
                    net_weight_grams="",
                    making_charge="",
                    ratti="2.5",
                    rate_per_ratti="1000",
                ),
            ]
        )
    )

    assert len(parsed.candidates) == 3
    assert parsed.candidates[1].item.stock_weight == 6.25
    assert parsed.candidates[1].item.quantity == 1
    assert parsed.candidates[2].item.metal == "stone"


def test_inventory_import_ignores_non_stock_export_rows_and_extra_columns() -> None:
    parsed = parse_inventory_csv(
        _csv_document(
            [
                _jewellery_row(status="sold", item_id="item-1"),
                _jewellery_row(barcode="87654321", status="in_stock", item_id="item-2"),
            ],
            extra_fields=("status", "item_id"),
        )
    )

    assert len(parsed.candidates) == 1
    assert parsed.ignored_non_stock_count == 1


def test_inventory_import_reports_row_specific_validation_errors() -> None:
    with pytest.raises(InventoryImportValidationError) as caught:
        parse_inventory_csv(_csv_document([_jewellery_row(quantity="0")]))

    assert any(issue.row == 2 and issue.field == "quantity" for issue in caught.value.issues)
