from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import anyio
from fastapi import HTTPException
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.changelog.service import AuditActor, log_change
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.items.models import Item
from app.modules.items.pricing import lock_price_at_sale
from app.modules.items.service import record_item_history
from app.modules.metal_rates.models import MetalRate
from app.modules.metal_rates.service import calculate_effective_rate_per_gram
from app.modules.sales.invoice import generate_invoice_pdf
from app.modules.sales.models import InvoiceJob, Sale, SaleItem
from app.modules.sales.schemas import SaleCreate
from app.modules.sales.storage import (
    InvoiceStorage,
    build_invoice_object_key,
)
from app.modules.shops.models import Shop


async def get_sale_by_id(
    db: AsyncSession,
    *,
    sale_id: UUID,
    shop_id: UUID,
    for_update: bool = False,
) -> Sale | None:
    stmt = (
        select(Sale)
        .where(
            Sale.id == sale_id,
            Sale.shop_id == shop_id,
        )
        .options(selectinload(Sale.items).selectinload(SaleItem.item))
    )
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_invoices(
    db: AsyncSession,
    *,
    shop_id: UUID,
    page: int,
    limit: int,
    search: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    pdf_status: str | None = None,
    cursor_created_at: datetime | None = None,
    cursor_id: UUID | None = None,
) -> tuple[list[Sale], int, bool]:
    filters = [Sale.shop_id == shop_id]
    if search and (normalized_search := search.strip()):
        escaped_search = (
            normalized_search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        ).lower()
        prefix_pattern = f"{escaped_search}%"
        contains_pattern = f"%{escaped_search}%"
        filters.append(
            or_(
                func.lower(Sale.invoice_no).like(prefix_pattern, escape="\\"),
                func.lower(Sale.customer_name).like(contains_pattern, escape="\\"),
                Sale.customer_phone.like(prefix_pattern, escape="\\"),
            )
        )
    if from_date is not None:
        filters.append(Sale.created_at >= from_date)
    if to_date is not None:
        filters.append(Sale.created_at <= to_date)
    if pdf_status is not None:
        filters.append(Sale.invoice_pdf_status == pdf_status)
    count_filters = tuple(filters)
    if cursor_created_at is not None and cursor_id is not None:
        filters.append(
            (Sale.created_at < cursor_created_at)
            | ((Sale.created_at == cursor_created_at) & (Sale.id < cursor_id))
        )

    total = int(await db.scalar(select(func.count(Sale.id)).where(*count_filters)) or 0)
    offset = 0 if cursor_created_at is not None else (page - 1) * limit
    result = await db.execute(
        select(Sale)
        .where(*filters)
        .order_by(Sale.created_at.desc(), Sale.id.desc())
        .offset(offset)
        .limit(limit + 1)
    )
    rows = list(result.scalars())
    return rows[:limit], total, len(rows) > limit


async def persist_invoice_pdf(
    *,
    shop_id: UUID,
    sale_id: UUID,
    storage: InvoiceStorage,
) -> Sale | None:
    async with AsyncSessionLocal.begin() as db:
        await db.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(shop_id)},
        )
        sale = await get_sale_by_id(
            db,
            sale_id=sale_id,
            shop_id=shop_id,
        )
        if sale is None or sale.s3_object_key is not None:
            return sale

        pdf = await anyio.to_thread.run_sync(generate_invoice_pdf, sale)
        generated_at = datetime.now(UTC)
        object_key = build_invoice_object_key(
            prefix=settings.s3_invoice_prefix,
            shop_id=shop_id,
            invoice_id=sale.id,
            created_at=sale.created_at,
        )

    metadata = await storage.upload_pdf(object_key=object_key, pdf=pdf)

    async with AsyncSessionLocal.begin() as db:
        await db.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(shop_id)},
        )
        sale = await get_sale_by_id(
            db,
            sale_id=sale_id,
            shop_id=shop_id,
            for_update=True,
        )
        if sale is not None:
            if sale.s3_object_key is None:
                sale.s3_object_key = object_key
                sale.pdf_generated_at = generated_at
                sale.pdf_checksum_sha256 = metadata.checksum_sha256
                sale.invoice_pdf_status = "ready"
                sale.invoice_pdf_last_error_code = None
                sale.invoice_pdf_lease_until = None
            return sale

    await storage.delete_pdf(object_key=object_key)
    return None


async def _execute_create_sale(
    db: AsyncSession,
    data: SaleCreate,
    *,
    shop_id: UUID,
    actor: AuditActor,
) -> Sale:
    """Internal helper to execute sale creation operations within an active transaction"""
    # Fetch items and lock them
    item_quantities: dict[UUID, int] = {}
    item_weights: dict[UUID, Decimal] = {}
    for input_item in data.items:
        if input_item.weight_grams is not None:
            item_weights[input_item.item_id] = (
                item_weights.get(input_item.item_id, Decimal(0)) + input_item.weight_grams
            )
        else:
            quantity = input_item.quantity or 1
            item_quantities[input_item.item_id] = (
                item_quantities.get(input_item.item_id, 0) + quantity
            )

    if set(item_quantities) & set(item_weights):
        raise HTTPException(400, "An item cannot be sold by quantity and weight together")
    item_ids = list(set(item_quantities) | set(item_weights))

    stmt = (
        select(Item)
        .where(
            Item.id.in_(item_ids),
            Item.shop_id == shop_id,
        )
        .with_for_update()
    )
    result = await db.execute(stmt)
    items = result.scalars().all()

    if len(items) != len(item_ids):
        raise HTTPException(400, "One or more items not found")

    item_by_id = {item.id: item for item in items}

    for item in items:
        if item.status != "in_stock":
            raise HTTPException(
                400,
                f"Item {item.sku} already sold or unavailable",
            )
        if item.stock_mode == "weight":
            weight_requested = item_weights.get(item.id)
            if weight_requested is None:
                raise HTTPException(400, f"Item {item.sku} requires a weight")
            if item.stock_weight is None or item.stock_weight < weight_requested:
                raise HTTPException(
                    400,
                    f"Item {item.sku} only has {item.stock_weight or 0} gram(s) available",
                )
        else:
            if item.id in item_weights:
                raise HTTPException(400, f"Item {item.sku} is sold by quantity")
            quantity_requested = item_quantities[item.id]
            if item.quantity < quantity_requested:
                raise HTTPException(
                    400,
                    f"Item {item.sku} only has {item.quantity} unit(s) available",
                )

    shop = await db.scalar(select(Shop).where(Shop.id == shop_id).with_for_update())
    if shop is None or not shop.is_active:
        raise HTTPException(404, "Shop does not exist")
    invoice_sequence = shop.next_invoice_sequence
    invoice_year = datetime.now(UTC).year
    while True:
        invoice_prefix = (shop.invoice_prefix or "INV").strip().upper()
        invoice_no = f"{invoice_prefix}-{invoice_year}-{invoice_sequence:06d}"
        if not await db.scalar(
            select(Sale.id).where(
                Sale.shop_id == shop_id,
                Sale.invoice_no == invoice_no,
            )
        ):
            break
        invoice_sequence += 1
    shop.next_invoice_sequence = invoice_sequence + 1

    # Create sale
    sale = Sale(
        shop_id=shop_id,
        invoice_no=invoice_no,
        total_amount=Decimal(0),
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        customer_address=data.customer_address,
        customer_state=shop.state or "West Bengal",
        customer_state_code=shop.state_code or "19",
        seller_name=shop.legal_name or shop.name,
        seller_tax_id=shop.tax_id,
        seller_phone=shop.phone,
        seller_address=shop.address,
        seller_state=shop.state or "West Bengal",
        seller_state_code=shop.state_code or "19",
        tax_rate_percent=None,
        invoice_pdf_status="pending",
    )
    db.add(sale)
    await db.flush()  # get sale.id
    db.add(InvoiceJob(shop_id=shop_id, sale_id=sale.id))

    sale_items: list[SaleItem] = []

    metal_names = {
        item.metal.lower()
        for item in items
        if item.item_type == "jewellery" and item.pricing_method != "fixed_rate"
    }
    rates_result = await db.execute(
        select(MetalRate)
        .where(
            MetalRate.shop_id == shop_id,
            func.lower(MetalRate.metal).in_(metal_names),
            MetalRate.purity == Decimal("100"),
        )
        .order_by(MetalRate.effective_from.desc())
    )
    rate_by_metal: dict[str, MetalRate] = {}
    for rate in rates_result.scalars():
        rate_by_metal.setdefault(rate.metal.lower(), rate)

    # Create sale items with locked pricing
    for item_id in item_ids:
        item = item_by_id[item_id]
        quantity_requested = item_quantities.get(item_id, 1)
        sold_weight = item_weights.get(item_id)
        effective_rate = Decimal(0)
        if item.item_type == "jewellery" and item.pricing_method != "fixed_rate":
            selected_rate = rate_by_metal.get(item.metal.lower())
            if selected_rate is None:
                raise HTTPException(400, f"Metal rate not set for {item.metal}")
            effective_rate = calculate_effective_rate_per_gram(
                metal=item.metal,
                purity=item.purity,
                base_rate_per_gram=selected_rate.rate_per_gram,
            )

        breakdown = lock_price_at_sale(
            metal=item.metal,
            category=item.category,
            item_type=item.item_type,
            pricing_method=item.pricing_method,
            purity=item.purity,
            net_weight=sold_weight if sold_weight is not None else item.net_weight,
            rate_per_gram=effective_rate,
            making_charge=item.making_charge,
            fixed_rate=item.fixed_rate,
            ratti=item.ratti,
            rate_per_ratti=item.rate_per_ratti,
        )

        line_multiplier = 1 if sold_weight is not None else quantity_requested
        line_total = Decimal(str(breakdown["final_price"])) * line_multiplier
        json_breakdown = {
            key: float(value) if isinstance(value, Decimal) else value
            for key, value in breakdown.items()
        }
        sale_item = SaleItem(
            shop_id=shop_id,
            sale_id=sale.id,
            item_id=item.id,
            quantity=quantity_requested,
            price=line_total,
            price_breakdown={
                **json_breakdown,
                "quantity": quantity_requested,
                "sold_weight": float(sold_weight) if sold_weight is not None else None,
                "line_total": float(line_total),
            },
            item_sku=item.sku,
            item_name=item.name,
            item_metal=item.metal,
            item_category=item.category,
            item_purity=item.purity,
            item_net_weight=item.net_weight,
            item_making_charge=item.making_charge,
            item_fixed_rate=item.fixed_rate,
            item_type=item.item_type,
            item_pricing_method=item.pricing_method,
            item_stock_mode=item.stock_mode,
            item_ratti=item.ratti,
            item_rate_per_ratti=item.rate_per_ratti,
            sold_weight=sold_weight,
        )

        db.add(sale_item)
        sale_items.append(sale_item)

    # Calculate invoice total (AFTER all items)
    sale.total_amount = sum((si.price for si in sale_items), start=Decimal(0))
    if data.total_amount is None and settings.is_hosted:
        raise HTTPException(
            status_code=422,
            detail="A confirmed checkout total is required",
        )
    if data.total_amount is not None:
        confirmed_total = Decimal(str(data.total_amount)).quantize(Decimal("0.01"))
        if confirmed_total != sale.total_amount:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "pricing_changed",
                    "message": "Pricing changed. Review the updated total before checkout.",
                    "current_total": float(sale.total_amount),
                },
            )
    shop.total_sales_amount += sale.total_amount

    # Decrement inventory and mark items sold if fully depleted
    for si in sale_items:
        item = item_by_id[si.item_id]
        if item.stock_mode == "weight":
            item.stock_weight = (item.stock_weight or Decimal(0)) - (si.sold_weight or Decimal(0))
            if item.stock_weight <= 0:
                item.stock_weight = Decimal(0)
                item.quantity = 0
                item.status = "sold"
            else:
                item.quantity = 1
                item.status = "in_stock"
        else:
            item.quantity -= si.quantity
            if item.quantity <= 0:
                item.quantity = 0
                item.status = "sold"
            else:
                item.status = "in_stock"
        record_item_history(db, item, event_type="sale")

        await log_change(
            db,
            shop_id=shop_id,
            entity="item",
            entity_id=item.id,
            action="sold",
            payload={
                "barcode": item.barcode,
                "sku": item.sku,
                "item_name": item.name,
                "invoice_no": sale.invoice_no,
                "quantity": si.quantity,
                "weight_grams": float(si.sold_weight) if si.sold_weight is not None else None,
                "pricing": si.price_breakdown,
            },
            actor=actor,
            subject_label=item.name,
            reference=item.barcode,
        )

    # Log sale summary
    await log_change(
        db,
        shop_id=shop_id,
        entity="sale",
        entity_id=sale.id,
        action="create",
        payload={
            "invoice_no": sale.invoice_no,
            "total": float(sale.total_amount),
            "state_code": sale.customer_state_code,
        },
        actor=actor,
        subject_label=f"Invoice {sale.invoice_no}",
        reference=sale.invoice_no,
    )

    return sale


async def create_sale(
    db: AsyncSession,
    data: SaleCreate,
    *,
    shop_id: UUID,
    actor: AuditActor,
) -> Sale:
    """Create a sale inside the request-scoped transaction."""
    sale = await _execute_create_sale(db, data, shop_id=shop_id, actor=actor)
    await db.flush()
    await db.refresh(sale)
    return sale
