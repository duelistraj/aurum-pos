from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.modules.sales.models import Sale


def _money(value: object) -> str:
    return f"{Decimal(str(value or 0)):.2f}"


def generate_invoice_pdf(sale: Sale) -> bytes:
    """Render an invoice from the immutable values captured on the sale."""
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Invoice {sale.invoice_no}",
    )
    styles = getSampleStyleSheet()
    right_aligned = ParagraphStyle("InvoiceRight", parent=styles["Normal"], alignment=TA_RIGHT)
    created_at = sale.created_at.strftime("%Y-%m-%d %H:%M") if sale.created_at else ""

    story = [
        Paragraph("Aurum POS", styles["Title"]),
        Paragraph(f"Invoice: {escape(sale.invoice_no)}", styles["Heading2"]),
        Paragraph(f"Date: {created_at}", styles["Normal"]),
        Spacer(1, 5 * mm),
        Paragraph(f"Customer: {escape(sale.customer_name)}", styles["Normal"]),
        Paragraph(f"Phone: {escape(sale.customer_phone)}", styles["Normal"]),
    ]
    if sale.customer_address:
        story.append(Paragraph(f"Address: {escape(sale.customer_address)}", styles["Normal"]))
    story.append(Spacer(1, 6 * mm))

    rows: list[list[object]] = [["Item", "Qty", "Metal", "Making", "GST", "Total"]]
    for sale_item in sale.items:
        item = sale_item.item
        pricing = sale_item.price_breakdown or {}
        item_name = getattr(sale_item, "item_name", None) or (
            item.name if item is not None else str(sale_item.item_id)
        )
        item_sku = getattr(sale_item, "item_sku", None) or (item.sku if item is not None else None)
        item_label = f"{item_name} ({item_sku})" if item_sku else item_name
        rows.append(
            [
                Paragraph(escape(item_label), styles["BodyText"]),
                sale_item.quantity,
                _money(pricing.get("metal_value")),
                _money(pricing.get("making_charge")),
                _money(pricing.get("gst_amount")),
                _money(pricing.get("line_total", sale_item.price)),
            ]
        )

    table = Table(rows, colWidths=[70 * mm, 12 * mm, 24 * mm, 24 * mm, 20 * mm, 25 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.extend(
        [
            table,
            Spacer(1, 7 * mm),
            Paragraph(f"Grand total: INR {_money(sale.total_amount)}", right_aligned),
        ]
    )

    document.build(story)
    return buffer.getvalue()
