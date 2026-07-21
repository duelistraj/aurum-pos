from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.changelog.service import log_change
from app.modules.items.models import Item
from app.modules.items.pricing import lock_price_at_sale
from app.modules.metal_rates.models import MetalRate
from app.modules.sales.models import Sale, SaleItem
from app.modules.sales.schemas import SaleCreate


async def get_sale_by_id(db: AsyncSession, sale_id: UUID) -> Sale | None:
    stmt = (
        select(Sale)
        .where(Sale.id == sale_id)
        .options(selectinload(Sale.items).selectinload(SaleItem.item))
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _execute_create_sale(db: AsyncSession, data: SaleCreate) -> Sale:
    """Internal helper to execute sale creation operations within an active transaction"""
    # Fetch items and lock them
    item_quantities: dict[UUID, int] = {}
    for input_item in data.items:
        item_quantities[input_item.item_id] = (
            item_quantities.get(input_item.item_id, 0) + input_item.quantity
        )

    item_ids = list(item_quantities.keys())

    stmt = select(Item).where(Item.id.in_(item_ids)).with_for_update()
    result = await db.execute(stmt)
    items = result.scalars().all()

    if len(items) != len(item_ids):
        raise HTTPException(400, "One or more items not found")

    item_by_id = {item.id: item for item in items}

    for item in items:
        quantity_requested = item_quantities[item.id]
        if item.status != "in_stock":
            raise HTTPException(
                400,
                f"Item {item.sku} already sold or unavailable",
            )
        if item.quantity < quantity_requested:
            raise HTTPException(
                400,
                f"Item {item.sku} only has {item.quantity} unit(s) available",
            )

    # Create sale
    sale = Sale(
        invoice_no=data.invoice_no,
        total_amount=Decimal(0),
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        customer_address=data.customer_address,
        customer_state="West Bengal",
        customer_state_code="19",
    )
    db.add(sale)
    await db.flush()  # get sale.id

    sale_items: list[SaleItem] = []

    rate_keys = {
        (item.metal.lower(), Decimal("100") if item.metal.lower() == "silver" else item.purity)
        for item in items
    }
    metal_names = {metal for metal, _purity in rate_keys}
    purities = {purity for _metal, purity in rate_keys}
    rates_result = await db.execute(
        select(MetalRate)
        .where(func.lower(MetalRate.metal).in_(metal_names), MetalRate.purity.in_(purities))
        .order_by(MetalRate.effective_from.desc())
    )
    rate_by_key: dict[tuple[str, Decimal], MetalRate] = {}
    for rate in rates_result.scalars():
        rate_by_key.setdefault((rate.metal.lower(), rate.purity), rate)

    # Create sale items with locked pricing
    for item_id, quantity_requested in item_quantities.items():
        item = item_by_id[item_id]
        effective_purity = Decimal("100") if item.metal.lower() == "silver" else item.purity
        selected_rate = rate_by_key.get((item.metal.lower(), effective_purity))

        if selected_rate is None:
            raise HTTPException(
                400,
                f"Metal rate not set for {item.metal}",
            )

        breakdown = lock_price_at_sale(
            metal=item.metal,
            category=item.category,
            purity=item.purity,
            net_weight=item.net_weight,
            rate_per_gram=selected_rate.rate_per_gram,
            making_charge=item.making_charge,
        )

        line_total = Decimal(str(breakdown["final_price"])) * quantity_requested
        json_breakdown = {
            key: float(value) if isinstance(value, Decimal) else value
            for key, value in breakdown.items()
        }
        sale_item = SaleItem(
            sale_id=sale.id,
            item_id=item.id,
            quantity=quantity_requested,
            price=line_total,
            price_breakdown={
                **json_breakdown,
                "quantity": quantity_requested,
                "line_total": float(line_total),
            },
        )

        db.add(sale_item)
        sale_items.append(sale_item)

    # Calculate invoice total (AFTER all items)
    sale.total_amount = sum((si.price for si in sale_items), start=Decimal(0))

    # Decrement inventory and mark items sold if fully depleted
    for si in sale_items:
        item = item_by_id[si.item_id]
        item.quantity -= si.quantity
        if item.quantity <= 0:
            item.quantity = 0
            item.status = "sold"
        else:
            item.status = "in_stock"

        await log_change(
            db,
            entity="item",
            entity_id=item.id,
            action="sold",
            payload={
                "barcode": item.barcode,
                "invoice_no": data.invoice_no,
                "quantity": si.quantity,
                "pricing": si.price_breakdown,
            },
        )

    # Log sale summary
    await log_change(
        db,
        entity="sale",
        entity_id=sale.id,
        action="create",
        payload={
            "invoice_no": sale.invoice_no,
            "total": float(sale.total_amount),
            "customer_phone": sale.customer_phone,
            "state_code": sale.customer_state_code,
        },
    )

    return sale


async def create_sale(db: AsyncSession, data: SaleCreate) -> Sale:
    """Create a sale inside the request-scoped transaction."""
    sale = await _execute_create_sale(db, data)
    await db.flush()
    await db.refresh(sale)
    return sale
