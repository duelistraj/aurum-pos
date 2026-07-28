import re
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

from openpyxl import load_workbook

from app.modules.sales.invoice import (
    ITEMS_PER_STANDARD_PAGE,
    _invoice_lines,
    _paginate_lines,
    _styles,
    generate_invoice_pdf,
    number_to_words_indian,
)
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
            "metal": "silver",
            "hsn": "7113",
            "effective_purity": 100,
            "rate_per_gram": 40.20,
            "net_weight": 2.5,
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
        customer_state="West Bengal",
        customer_state_code="19",
        seller_name="Snapshot Jewellers",
        seller_tax_id="19ABCDE1234F1Z5",
        seller_address="M.G. Road, Kolkata",
        seller_state="West Bengal",
        seller_state_code="19",
        tax_rate_percent=3,
        items=[sale_item],
        total_amount=113.87,
    )

    pdf = generate_invoice_pdf(sale)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 10_000


def test_invoice_line_items_do_not_depend_on_mutable_inventory_relationships() -> None:
    sale_item = SimpleNamespace(
        item=None,
        item_id=uuid4(),
        item_name="Snapshot Gold Necklace",
        item_sku="GOLD-100",
        item_metal="gold",
        item_purity=91.6,
        item_net_weight=10.125,
        quantity=2,
        price=14_935.86,
        price_breakdown={
            "metal": "gold",
            "hsn": "7113",
            "effective_purity": 91.6,
            "rate_per_gram": 700,
            "net_weight": 10.125,
            "metal_value": 7_087.50,
            "making_charge": 162.50,
            "gst_amount": 217.50,
            "line_total": 14_935.86,
        },
    )
    sale = SimpleNamespace(items=[sale_item], total_amount=14_935.86)

    lines, totals = _invoice_lines(sale, _styles())

    assert len(lines) == 1
    assert lines[0].row[0:2] == ("G", "GOLD-100")
    assert lines[0].row[3:] == (
        "7113",
        "91.6",
        "20.250",
        2,
        "700.00",
        "14175.00",
        "325.00",
        "14935.86",
    )
    assert totals.quantity == 2
    assert totals.net_weight == Decimal("20.250")
    assert totals.gst_amount == Decimal("435.00")
    assert totals.grand_total == Decimal("14935.86")


def test_invoice_paginates_after_historical_sixteen_item_layout() -> None:
    item = _item()
    sale_items = [
        SimpleNamespace(
            item=item,
            item_id=item.id,
            quantity=1,
            price=113.87,
            price_breakdown={
                "metal": "silver",
                "hsn": "7113",
                "effective_purity": 100,
                "rate_per_gram": 40.20,
                "net_weight": 2.5,
                "metal_value": 100.50,
                "making_charge": 10.05,
                "gst_amount": 3.32,
            },
        )
        for _ in range(ITEMS_PER_STANDARD_PAGE + 1)
    ]
    sale = SimpleNamespace(
        invoice_no="INV-200",
        created_at=None,
        customer_name="Test Customer",
        customer_phone="9999999999",
        customer_address="Kolkata",
        customer_state="West Bengal",
        customer_state_code="19",
        seller_name="Snapshot Jewellers",
        seller_tax_id="19ABCDE1234F1Z5",
        seller_address="M.G. Road, Kolkata",
        seller_state="West Bengal",
        seller_state_code="19",
        tax_rate_percent=3,
        items=sale_items,
        total_amount=1_935.79,
    )
    lines, _ = _invoice_lines(sale, _styles())

    assert [len(page) for page in _paginate_lines(lines)] == [16, 1]
    pdf = generate_invoice_pdf(sale)
    assert len(re.findall(rb"/Type\s*/Page\b", pdf)) == 2


def test_invoice_amount_words_preserve_paise_and_indian_scales() -> None:
    assert (
        number_to_words_indian("12345678.90")
        == "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight "
        "Rupees and Ninety Paise Only"
    )
