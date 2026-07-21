from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

from openpyxl import load_workbook

from app.modules.sales.invoice import generate_invoice_pdf
from app.utils.label import generate_batch_labels_xlsx


def _item(**overrides: object) -> SimpleNamespace:
    values = {
        "id": uuid4(),
        "name": "Silver Ring",
        "sku": "SKU-1",
        "barcode": "12345678",
        "category": "ring",
        "metal": "silver",
        "purity": 92.5,
        "net_weight": 2.5,
        "making_charge": 100,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_xlsx_labels_have_matching_fifteen_columns() -> None:
    workbook = load_workbook(BytesIO(generate_batch_labels_xlsx([_item()])))
    worksheet = workbook.active
    headers = [cell.value for cell in worksheet[1]]
    values = [cell.value for cell in worksheet[2]]

    assert len(headers) == 15
    assert len(values) == 15
    assert headers[-3:] == ["Barcode 1", "Barcode 2", "Barcode 3"]


def test_invoice_is_generated_from_locked_sale_values() -> None:
    item = _item()
    sale_item = SimpleNamespace(
        item=item,
        item_id=item.id,
        quantity=1,
        price=113.87,
        price_breakdown={
            "metal_value": 100.50,
            "making_charge": 10.05,
            "gst_amount": 3.32,
            "line_total": 113.87,
        },
    )
    sale = SimpleNamespace(
        invoice_no="INV-100",
        created_at=None,
        customer_name="Test Customer",
        customer_phone="9999999999",
        customer_address="Kolkata",
        items=[sale_item],
        total_amount=113.87,
    )

    pdf = generate_invoice_pdf(sale)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 1_000
