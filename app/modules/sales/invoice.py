from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph, Table, TableStyle

from app.modules.sales.models import Sale

PAGE_WIDTH, PAGE_HEIGHT = A4
LEFT_MARGIN = 30.0
RIGHT_MARGIN = PAGE_WIDTH - 30.0
PRINTABLE_WIDTH = RIGHT_MARGIN - LEFT_MARGIN
TABLE_TOP = PAGE_HEIGHT - 163.0
TABLE_BOTTOM = 220.0
TABLE_HEADER_HEIGHT = 22.0
TABLE_FOOTER_HEIGHT = 22.0
ITEM_AREA_HEIGHT = TABLE_TOP - TABLE_BOTTOM - TABLE_HEADER_HEIGHT - TABLE_FOOTER_HEIGHT
ITEMS_PER_STANDARD_PAGE = 16
STANDARD_ITEM_HEIGHT = ITEM_AREA_HEIGHT / ITEMS_PER_STANDARD_PAGE
MONEY_QUANTUM = Decimal("0.01")

FONTS_DIRECTORY = Path(__file__).with_name("fonts")
REGULAR_FONT_PATH = FONTS_DIRECTORY / "Roboto-Regular.ttf"
BOLD_FONT_PATH = FONTS_DIRECTORY / "Roboto-Bold.ttf"
REGULAR_FONT = "AurumRoboto"
BOLD_FONT = "AurumRoboto-Bold"

pdfmetrics.registerFont(TTFont(REGULAR_FONT, REGULAR_FONT_PATH))
pdfmetrics.registerFont(TTFont(BOLD_FONT, BOLD_FONT_PATH))


@dataclass(frozen=True)
class InvoiceLine:
    row: tuple[object, ...]
    height: float
    net_weight: Decimal
    quantity: int
    metal_value: Decimal
    making_charge: Decimal
    gst_amount: Decimal
    gst_rate_percent: Decimal


@dataclass(frozen=True)
class InvoiceTotals:
    net_weight: Decimal
    quantity: int
    metal_value: Decimal
    making_charge: Decimal
    gst_amount: Decimal
    grand_total: Decimal
    tax_groups: dict[Decimal, Decimal]


def _decimal(value: object) -> Decimal:
    if value is None or value == "":
        return Decimal(0)
    return Decimal(str(value))


def _money(value: object) -> str:
    return f"{_decimal(value).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP):.2f}"


def _weight(value: object) -> str:
    return f"{_decimal(value).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP):.3f}"


def _compact_decimal(value: object) -> str:
    normalized = _decimal(value).normalize()
    return format(normalized, "f")


def _under_thousand_to_words(value: int) -> str:
    units = (
        "",
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "Nine",
    )
    teens = (
        "Ten",
        "Eleven",
        "Twelve",
        "Thirteen",
        "Fourteen",
        "Fifteen",
        "Sixteen",
        "Seventeen",
        "Eighteen",
        "Nineteen",
    )
    tens = (
        "",
        "",
        "Twenty",
        "Thirty",
        "Forty",
        "Fifty",
        "Sixty",
        "Seventy",
        "Eighty",
        "Ninety",
    )
    words: list[str] = []
    remainder = value
    if remainder >= 100:
        words.append(f"{units[remainder // 100]} Hundred")
        remainder %= 100
    if remainder >= 20:
        words.append(tens[remainder // 10])
        remainder %= 10
    elif remainder >= 10:
        words.append(teens[remainder - 10])
        remainder = 0
    if remainder:
        words.append(units[remainder])
    return " ".join(words)


def number_to_words_indian(value: object) -> str:
    """Convert a non-negative amount to Indian rupee words."""
    amount = _decimal(value).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    if amount < 0:
        return f"Minus {number_to_words_indian(-amount)}"

    rupees = int(amount)
    paise = int((amount - Decimal(rupees)) * 100)
    words: list[str] = []
    remainder = rupees
    for divisor, scale in (
        (10_000_000, "Crore"),
        (100_000, "Lakh"),
        (1_000, "Thousand"),
    ):
        chunk, remainder = divmod(remainder, divisor)
        if chunk:
            words.append(f"{_under_thousand_to_words(chunk)} {scale}")
    if remainder:
        words.append(_under_thousand_to_words(remainder))
    if not words:
        words.append("Zero")

    result = f"{' '.join(words)} Rupees"
    if paise:
        result = f"{result} and {_under_thousand_to_words(paise)} Paise"
    return f"{result} Only"


def _styles() -> dict[str, ParagraphStyle]:
    return {
        "small": ParagraphStyle(
            name="InvoiceSmall",
            fontName=REGULAR_FONT,
            fontSize=8,
            leading=9,
        ),
        "small_bold_center": ParagraphStyle(
            name="InvoiceSmallBoldCenter",
            fontName=BOLD_FONT,
            fontSize=8,
            leading=9,
            alignment=TA_CENTER,
        ),
        "seller": ParagraphStyle(
            name="InvoiceSeller",
            fontName=BOLD_FONT,
            fontSize=16,
            leading=17,
            alignment=TA_CENTER,
        ),
        "seller_address": ParagraphStyle(
            name="InvoiceSellerAddress",
            fontName=REGULAR_FONT,
            fontSize=8,
            leading=9,
            alignment=TA_CENTER,
        ),
        "amount_words": ParagraphStyle(
            name="InvoiceAmountWords",
            fontName=BOLD_FONT,
            fontSize=8,
            leading=10,
        ),
    }


def _snapshot_value(source: object, snapshot_name: str, legacy_name: str) -> object | None:
    snapshot = getattr(source, snapshot_name, None)
    if snapshot is not None:
        return snapshot
    legacy_item = getattr(source, "item", None)
    return getattr(legacy_item, legacy_name, None) if legacy_item is not None else None


def _invoice_lines(
    sale: Sale,
    styles: dict[str, ParagraphStyle],
) -> tuple[list[InvoiceLine], InvoiceTotals]:
    lines: list[InvoiceLine] = []
    total_net_weight = Decimal(0)
    total_quantity = 0
    total_metal_value = Decimal(0)
    total_making_charge = Decimal(0)
    total_gst = Decimal(0)
    tax_groups: dict[Decimal, Decimal] = {}

    for sale_item in sale.items:
        pricing = sale_item.price_breakdown or {}
        quantity = int(sale_item.quantity)
        quantity_decimal = Decimal(quantity)
        item_name = _snapshot_value(sale_item, "item_name", "name") or str(sale_item.item_id)
        item_sku = _snapshot_value(sale_item, "item_sku", "sku") or ""
        item_metal = pricing.get("metal") or _snapshot_value(sale_item, "item_metal", "metal") or ""
        item_purity = _snapshot_value(sale_item, "item_purity", "purity")
        item_type = _snapshot_value(sale_item, "item_type", "item_type") or pricing.get(
            "item_type", "jewellery"
        )
        effective_purity = pricing.get("effective_purity", item_purity)
        is_unspecified_silver = str(item_metal).strip().lower() == "silver" and (
            item_purity is None or _decimal(item_purity) == 0
        )
        if item_type == "stone":
            purity = _compact_decimal(_snapshot_value(sale_item, "item_ratti", "ratti"))
        else:
            purity = "" if is_unspecified_silver else _compact_decimal(effective_purity)

        unit_net_weight = _decimal(
            pricing.get(
                "net_weight",
                _snapshot_value(sale_item, "item_net_weight", "net_weight"),
            )
        )
        net_weight = unit_net_weight * quantity_decimal
        fixed_rate = _decimal(pricing.get("fixed_rate")) * quantity_decimal
        metal_value = (_decimal(pricing.get("metal_value")) * quantity_decimal) + fixed_rate
        making_charge = _decimal(pricing.get("making_charge")) * quantity_decimal
        gst_amount = _decimal(pricing.get("gst_amount")) * quantity_decimal
        gst_rate = _decimal(pricing.get("gst_rate_percent"))
        description = Paragraph(escape(str(item_name)), styles["small"])
        _, description_height = description.wrap(91.0, ITEM_AREA_HEIGHT)
        row_height = max(STANDARD_ITEM_HEIGHT, description_height + 6.0)

        lines.append(
            InvoiceLine(
                row=(
                    "S" if item_type == "stone" else str(item_metal)[:1].upper(),
                    str(item_sku),
                    description,
                    str(pricing.get("hsn") or ""),
                    purity,
                    "" if item_type == "stone" else _weight(net_weight),
                    quantity,
                    _money(
                        _snapshot_value(sale_item, "item_rate_per_ratti", "rate_per_ratti")
                        if item_type == "stone"
                        else pricing.get("rate_per_gram")
                    ),
                    _money(metal_value),
                    _money(making_charge),
                    _money(sale_item.price),
                ),
                height=row_height,
                net_weight=net_weight,
                quantity=quantity,
                metal_value=metal_value,
                making_charge=making_charge,
                gst_amount=gst_amount,
                gst_rate_percent=gst_rate,
            )
        )
        total_net_weight += net_weight
        total_quantity += quantity
        total_metal_value += metal_value
        total_making_charge += making_charge
        total_gst += gst_amount
        tax_groups[gst_rate] = tax_groups.get(gst_rate, Decimal(0)) + gst_amount

    return lines, InvoiceTotals(
        net_weight=total_net_weight,
        quantity=total_quantity,
        metal_value=total_metal_value,
        making_charge=total_making_charge,
        gst_amount=total_gst,
        grand_total=_decimal(sale.total_amount),
        tax_groups=tax_groups,
    )


def _paginate_lines(lines: list[InvoiceLine]) -> list[list[InvoiceLine]]:
    if not lines:
        return [[]]
    pages: list[list[InvoiceLine]] = []
    current_page: list[InvoiceLine] = []
    current_height = 0.0
    for line in lines:
        page_is_full = len(current_page) >= ITEMS_PER_STANDARD_PAGE
        line_overflows = current_page and current_height + line.height > ITEM_AREA_HEIGHT + 0.001
        if page_is_full or line_overflows:
            pages.append(current_page)
            current_page = []
            current_height = 0.0
        current_page.append(line)
        current_height += line.height
    pages.append(current_page)
    return pages


def _draw_paragraph_from_top(
    canvas: Canvas,
    paragraph: Paragraph,
    *,
    x: float,
    top: float,
    width: float,
) -> float:
    _, height = paragraph.wrap(width, PAGE_HEIGHT)
    paragraph.drawOn(canvas, x, top - height)
    return height


def _draw_header(
    canvas: Canvas,
    sale: Sale,
    styles: dict[str, ParagraphStyle],
    *,
    page_number: int,
    page_count: int,
) -> None:
    canvas.setFont(BOLD_FONT, 14)
    canvas.drawString(LEFT_MARGIN, PAGE_HEIGHT - 40, "GST INVOICE")
    seller_tax_id = getattr(sale, "seller_tax_id", None)
    if seller_tax_id:
        canvas.setFont(REGULAR_FONT, 9)
        canvas.drawString(LEFT_MARGIN, PAGE_HEIGHT - 52, f"GSTIN: {seller_tax_id}")

    seller_name = getattr(sale, "seller_name", None) or "Aurum POS"
    center_width = 245.0
    center_x = (PAGE_WIDTH - center_width) / 2
    seller_paragraph = Paragraph(escape(str(seller_name).upper()), styles["seller"])
    seller_height = _draw_paragraph_from_top(
        canvas,
        seller_paragraph,
        x=center_x,
        top=PAGE_HEIGHT - 27,
        width=center_width,
    )
    seller_location = getattr(sale, "seller_address", None)
    seller_state = getattr(sale, "seller_state", None)
    seller_state_code = getattr(sale, "seller_state_code", None)
    seller_phone = getattr(sale, "seller_phone", None)
    location_parts = [str(seller_location)] if seller_location else []
    if seller_state:
        state = str(seller_state)
        if seller_state_code:
            state = f"{state} - {seller_state_code}"
        location_parts.append(state)
    if seller_phone:
        location_parts.append(f"Phone: {seller_phone}")
    if location_parts:
        location_paragraph = Paragraph(
            "<br/>".join(escape(part) for part in location_parts),
            styles["seller_address"],
        )
        _draw_paragraph_from_top(
            canvas,
            location_paragraph,
            x=center_x,
            top=PAGE_HEIGHT - 29 - seller_height,
            width=center_width,
        )

    canvas.setFont(REGULAR_FONT, 9)
    canvas.drawRightString(RIGHT_MARGIN, PAGE_HEIGHT - 40, f"Invoice: {sale.invoice_no}")
    created_at = sale.created_at.strftime("%d/%m/%Y") if sale.created_at else ""
    canvas.drawRightString(RIGHT_MARGIN, PAGE_HEIGHT - 52, f"Date: {created_at}")
    if page_count > 1:
        canvas.drawRightString(
            RIGHT_MARGIN,
            PAGE_HEIGHT - 64,
            f"Page {page_number} of {page_count}",
        )


def _draw_customer(canvas: Canvas, sale: Sale) -> None:
    y = PAGE_HEIGHT - 100
    canvas.setFont(BOLD_FONT, 9)
    canvas.drawString(LEFT_MARGIN, y, "Customer Name & Address:")
    canvas.setFont(REGULAR_FONT, 9)
    canvas.drawString(LEFT_MARGIN, y - 12, str(sale.customer_name))
    canvas.drawString(LEFT_MARGIN, y - 24, f"Address: {sale.customer_address or ''}")
    canvas.drawString(LEFT_MARGIN, y - 36, f"Ph # {sale.customer_phone}")
    state = str(getattr(sale, "customer_state", None) or "")
    state_code = str(getattr(sale, "customer_state_code", None) or "")
    canvas.drawString(LEFT_MARGIN, y - 48, f"State: {state}  State Code: {state_code}")


def _table_headers(styles: dict[str, ParagraphStyle]) -> list[object]:
    centered = styles["small_bold_center"]
    return [
        "Type",
        "Tag No.",
        "Description",
        Paragraph("Hsn<br/>Code", centered),
        Paragraph("Purity /<br/>Ratti", centered),
        Paragraph("Net Wt.<br/>(g)", centered),
        "Pcs.",
        Paragraph("Rate<br/>(unit)", centered),
        "Value",
        Paragraph("Making<br/>Charges", centered),
        "Amount",
    ]


def _blank_rows_and_heights(lines: list[InvoiceLine]) -> tuple[list[list[object]], list[float]]:
    used_height = sum(line.height for line in lines)
    remaining_height = max(0.0, ITEM_AREA_HEIGHT - used_height)
    available_slots = max(0, ITEMS_PER_STANDARD_PAGE - len(lines))
    blank_count = min(available_slots, int(remaining_height // STANDARD_ITEM_HEIGHT))
    if blank_count == 0:
        return [], []
    blank_height = remaining_height / blank_count
    blank_rows: list[list[object]] = []
    for _ in range(blank_count):
        blank_row: list[object] = [""] * 11
        blank_rows.append(blank_row)
    return blank_rows, [blank_height] * blank_count


def _draw_items_table(
    canvas: Canvas,
    lines: list[InvoiceLine],
    totals: InvoiceTotals,
    styles: dict[str, ParagraphStyle],
    *,
    is_final_page: bool,
) -> None:
    rows: list[list[object]] = [_table_headers(styles), *[list(line.row) for line in lines]]
    blank_rows, blank_heights = _blank_rows_and_heights(lines)
    rows.extend(blank_rows)
    if is_final_page:
        rows.append(
            [
                "Total",
                "",
                "",
                "",
                "",
                _weight(totals.net_weight),
                totals.quantity,
                "",
                _money(totals.metal_value),
                _money(totals.making_charge),
                _money(totals.grand_total),
            ]
        )
    else:
        continuation_row: list[object] = ["Continued on next page", *([""] * 10)]
        rows.append(continuation_row)

    row_heights = [
        TABLE_HEADER_HEIGHT,
        *[line.height for line in lines],
        *blank_heights,
        TABLE_FOOTER_HEIGHT,
    ]
    height_difference = TABLE_TOP - TABLE_BOTTOM - sum(row_heights)
    if abs(height_difference) > 0.001:
        adjustable_index = -2 if len(row_heights) > 2 else 0
        row_heights[adjustable_index] += height_difference

    table = Table(
        rows,
        colWidths=[20, 75, 95, 35, 30, 45, 20, 55, 55, 55, 50.27],
        rowHeights=row_heights,
    )
    commands: list[tuple[object, ...]] = [
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.black),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.black),
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("FONT", (0, 0), (-1, 0), BOLD_FONT),
        ("FONT", (0, 1), (-1, -1), REGULAR_FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("ALIGN", (1, 0), (2, 0), "LEFT"),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("ALIGN", (4, 1), (4, -1), "CENTER"),
        ("ALIGN", (5, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONT", (0, -1), (-1, -1), BOLD_FONT),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    if not is_final_page:
        commands.extend(
            [
                ("SPAN", (0, -1), (-1, -1)),
                ("ALIGN", (0, -1), (-1, -1), "RIGHT"),
            ]
        )
    table.setStyle(TableStyle(commands))
    table.wrapOn(canvas, PRINTABLE_WIDTH, PAGE_HEIGHT)
    table.drawOn(canvas, LEFT_MARGIN, TABLE_BOTTOM)


def _rate(value: Decimal) -> str:
    return f"{value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP):.2f}"


def _draw_summary(
    canvas: Canvas,
    sale: Sale,
    totals: InvoiceTotals,
    styles: dict[str, ParagraphStyle],
) -> None:
    tax_total = totals.gst_amount.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    sgst_amount = (tax_total / 2).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    cgst_amount = tax_total - sgst_amount
    total_before_tax = totals.grand_total - tax_total
    tax_rows: list[list[str]] = []
    if totals.tax_groups:
        for tax_rate, group_tax in sorted(totals.tax_groups.items()):
            group_sgst = (group_tax / 2).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
            tax_rows.extend(
                [
                    [f"SGST {_rate(tax_rate / 2)}%:", _money(group_sgst)],
                    [f"CGST {_rate(tax_rate / 2)}%:", _money(group_tax - group_sgst)],
                ]
            )
    else:
        legacy_rate = _decimal(getattr(sale, "tax_rate_percent", 0)) / 2
        tax_rows = [
            [f"SGST {_rate(legacy_rate)}%:", _money(sgst_amount)],
            [f"CGST {_rate(legacy_rate)}%:", _money(cgst_amount)],
        ]

    summary = Table(
        [
            ["Total Amt. Before Tax:", _money(total_before_tax)],
            *tax_rows,
            ["Total Amnt. With Tax:", _money(totals.grand_total)],
            ["ROUND OFF:", "0.00"],
            ["Receipt / Net Amt.:", f"₹ {_money(totals.grand_total)}"],
        ],
        colWidths=[150, 80],
    )
    summary.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), REGULAR_FONT, 8),
                ("FONT", (0, -1), (-1, -1), BOLD_FONT, 8),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.black),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    summary.wrapOn(canvas, 230, 150)
    summary.drawOn(canvas, RIGHT_MARGIN - 230, 95)

    amount_words = Paragraph(
        f"Amount in Words: {escape(number_to_words_indian(totals.grand_total))}",
        styles["amount_words"],
    )
    _draw_paragraph_from_top(
        canvas,
        amount_words,
        x=LEFT_MARGIN,
        top=205,
        width=PRINTABLE_WIDTH - 245,
    )

    canvas.setFont(REGULAR_FONT, 8)
    canvas.drawString(LEFT_MARGIN, 95, "Customer Signature: _______________________")
    canvas.drawString(LEFT_MARGIN, 70, "Declaration: Goods once sold are non-returnable.")
    seller_name = getattr(sale, "seller_name", None) or "Aurum POS"
    canvas.setFont(BOLD_FONT, 8)
    canvas.drawRightString(RIGHT_MARGIN, 75, f"FOR {str(seller_name).upper()}")
    canvas.setFont(REGULAR_FONT, 8)
    canvas.drawRightString(RIGHT_MARGIN, 40, "Authorised Signatory")


def generate_invoice_pdf(sale: Sale) -> bytes:
    """Render a GST invoice from the immutable values captured on the sale."""
    buffer = BytesIO()
    canvas = Canvas(buffer, pagesize=A4)
    canvas.setTitle(f"Invoice {sale.invoice_no}")
    canvas.setAuthor(str(getattr(sale, "seller_name", None) or "Aurum POS"))
    canvas.setCreator("Aurum POS")
    styles = _styles()
    lines, totals = _invoice_lines(sale, styles)
    pages = _paginate_lines(lines)

    for page_index, page_lines in enumerate(pages):
        page_number = page_index + 1
        is_final_page = page_number == len(pages)
        _draw_header(
            canvas,
            sale,
            styles,
            page_number=page_number,
            page_count=len(pages),
        )
        _draw_customer(canvas, sale)
        _draw_items_table(
            canvas,
            page_lines,
            totals,
            styles,
            is_final_page=is_final_page,
        )
        if is_final_page:
            _draw_summary(canvas, sale, totals, styles)
        canvas.showPage()

    canvas.save()
    return buffer.getvalue()
