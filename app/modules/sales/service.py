from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException
from uuid import UUID

from app.modules.sales.models import Sale, SaleItem
from app.modules.items.models import Item
from app.modules.sales.schemas import SaleCreate
from app.core.changelog.service import log_change
from app.modules.metal_rates.service import get_latest_metal_rate
from app.modules.items.pricing import lock_price_at_sale


async def _execute_create_sale(db: AsyncSession, data: SaleCreate) -> Sale:
    """Internal helper to execute sale creation operations within an active transaction"""
    # Fetch items and lock them
    item_quantities: dict[UUID, int] = {}
    for input_item in data.items:
        item_quantities[input_item.item_id] = (
            item_quantities.get(input_item.item_id, 0) + input_item.quantity
        )

    item_ids = list(item_quantities.keys())

    stmt = (
        select(Item)
        .where(Item.id.in_(item_ids))
        .with_for_update()
    )
    result = await db.execute(stmt)
    items = result.scalars().all()

    if len(items) != len(item_ids):
        raise HTTPException(400, "One or more items not found")

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
        total_amount=0,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        customer_address=data.customer_address,
        customer_state="West Bengal",
        customer_state_code="19",
    )
    db.add(sale)
    await db.flush()  # get sale.id

    sale_items: list[SaleItem] = []

    # Create sale items with locked pricing
    for item_id, quantity_requested in item_quantities.items():
        item = next(i for i in items if i.id == item_id)

        rate = await get_latest_metal_rate(
            db,
            metal=item.metal,
            purity=float(item.purity),
        )

        if not rate:
            raise HTTPException(
                400,
                f"Metal rate not set for {item.metal}",
            )

        breakdown = lock_price_at_sale(
            metal=item.metal,
            category=item.category,
            purity=float(item.purity),
            net_weight=float(item.net_weight),
            rate_per_gram=float(rate.rate_per_gram),
            making_charge=float(item.making_charge),
        )

        line_total = breakdown["final_price"] * quantity_requested
        sale_item = SaleItem(
            sale_id=sale.id,
            item_id=item.id,
            quantity=quantity_requested,
            price=line_total,
            price_breakdown={
                **breakdown,
                "quantity": quantity_requested,
                "line_total": line_total,
            },
        )

        db.add(sale_item)
        sale_items.append(sale_item)

    # Calculate invoice total (AFTER all items)
    sale.total_amount = sum(
        si.price for si in sale_items
    )

    # Decrement inventory and mark items sold if fully depleted
    for si in sale_items:
        item = next(i for i in items if i.id == si.item_id)
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
            "total": sale.total_amount,
            "customer_phone": sale.customer_phone,
            "state_code": sale.customer_state_code,
        },
    )

    return sale


async def create_sale(db: AsyncSession, data: SaleCreate) -> Sale:
    """Atomic sale creation wrapper supporting parent and nested savepoint transactions"""
    if not db.in_transaction():
        async with db.begin():
            sale = await _execute_create_sale(db, data)
    else:
        async with db.begin_nested():
            sale = await _execute_create_sale(db, data)
        await db.commit()

    await db.refresh(sale)
    return sale
