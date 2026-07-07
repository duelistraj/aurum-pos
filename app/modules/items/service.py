from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
import random
import string

from app.modules.items.models import Item
from app.modules.items.schemas import ItemCreate, ItemUpdate
from app.core.changelog.service import log_change


async def generate_unique_barcode(db: AsyncSession) -> str:
    """Generate a unique 8-digit barcode"""
    while True:
        # Generate random 8-digit barcode
        barcode = ''.join(random.choices(string.digits, k=8))
        
        # Check if barcode already exists
        stmt = select(Item).where(Item.barcode == barcode)
        result = await db.execute(stmt)
        if not result.scalar_one_or_none():
            return barcode


async def create_item(db: AsyncSession, data: ItemCreate) -> Item:
    item_data = data.model_dump()
    
    # Generate barcode if not provided
    if not item_data.get('barcode'):
        item_data['barcode'] = await generate_unique_barcode(db)
    
    # If category is unique, always set net_weight to 0
    if item_data.get('category') == 'unique':
        item_data['net_weight'] = 0
    
    item = Item(**item_data)
    db.add(item)
    await db.flush()

    await log_change(
        db,
        entity="item",
        entity_id=item.id,
        action="create",
        payload={
            "sku": item.sku,
            "barcode": item.barcode,
        },
    )

    await db.commit()
    await db.refresh(item)
    return item


async def update_item(db: AsyncSession, item_id: UUID, data: ItemUpdate) -> Item:
    item = await get_item_by_id(db, item_id)
    if not item:
        raise ValueError("Item does not exist")
    if item.status != "in_stock":
        raise ValueError("Only in_stock items can be edited")

    # Store before values for fields that might change (excluding status)
    before = {
        "sku": item.sku,
        "barcode": item.barcode,
        "category": item.category,
        "name": item.name,
        "metal": item.metal,
        "purity": float(item.purity),
        "net_weight": float(item.net_weight),
        "making_charge": float(item.making_charge) if item.making_charge is not None else None,
        "quantity": item.quantity,
        "notes": item.notes,
    }

    item_data = data.model_dump()
    
    # Remove status from tracking if it exists
    item_data_for_logging = {k: v for k, v in item_data.items() if k != "status"}
    
    # Convert float values for logging
    if "purity" in item_data_for_logging and item_data_for_logging["purity"] is not None:
        item_data_for_logging["purity"] = float(item_data_for_logging["purity"])
    if "net_weight" in item_data_for_logging and item_data_for_logging["net_weight"] is not None:
        item_data_for_logging["net_weight"] = float(item_data_for_logging["net_weight"])
    if "making_charge" in item_data_for_logging and item_data_for_logging["making_charge"] is not None:
        item_data_for_logging["making_charge"] = float(item_data_for_logging["making_charge"])
    
    # Build a more user-friendly change log with only changed fields
    changes = {}
    for field, after_value in item_data_for_logging.items():
        if field in before:
            before_value = before[field]
            if before_value != after_value:
                changes[field] = {
                    "before": before_value,
                    "after": after_value,
                }

    # If category is unique, always set net_weight to 0
    if item_data.get('category') == 'unique':
        item_data['net_weight'] = 0
    
    # Apply changes to the item
    for field, value in item_data.items():
        setattr(item, field, value)

    # Only log if there are actual changes (excluding status)
    if changes:
        await log_change(
            db,
            entity="item",
            entity_id=item.id,
            action="update",
            payload={
                "barcode": item.barcode,
                "changes": changes,
            },
        )

    await db.commit()
    await db.refresh(item)
    return item


async def delete_item(db: AsyncSession, item_id: UUID) -> None:
    item = await get_item_by_id(db, item_id)
    if not item:
        raise ValueError("Item does not exist")
    if item.status != "in_stock":
        raise ValueError("Only in_stock items can be deleted")

    payload = {
        "sku": item.sku,
        "barcode": item.barcode,
        "category": item.category,
        "name": item.name,
        "metal": item.metal,
        "purity": float(item.purity),
        "net_weight": float(item.net_weight),
        "making_charge": float(item.making_charge) if item.making_charge is not None else None,
        "quantity": item.quantity,
        "notes": item.notes,
    }

    await log_change(
        db,
        entity="item",
        entity_id=item.id,
        action="delete",
        payload=payload,
    )
    await db.delete(item)
    await db.commit()


async def get_item_by_id(db: AsyncSession, item_id: UUID) -> Item | None:
    stmt = select(Item).where(Item.id == item_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_item_by_barcode(db: AsyncSession, barcode: str) -> Item | None:
    stmt = select(Item).where(Item.barcode == barcode)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_items(db: AsyncSession) -> list[Item]:
    stmt = select(Item).order_by(Item.updated_at.desc())
    stmt = stmt.where(Item.status == "in_stock")
    
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_latest_item(db: AsyncSession) -> Item | None:
    stmt = select(Item).order_by(Item.updated_at.desc()).limit(1)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_item_for_pos_by_barcode(
    db: AsyncSession, barcode: str
) -> Item | None:
    stmt = (
        select(Item)
        .where(
            Item.barcode == barcode,
            Item.status == "in_stock",
        )
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_items_for_label_printing(
    db: AsyncSession,
    only_in_stock: bool = True,
):
    stmt = select(Item)

    if only_in_stock:
        stmt = stmt.where(Item.status == "in_stock")

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_items_paginated(
    db: AsyncSession,
    page: int = 1,
    limit: int = 10,
    search: str | None = None,
    category: str | None = None,
    status: str | None = None,
) -> tuple[list[Item], int]:
    stmt = select(Item).order_by(Item.updated_at.desc())
    
    # Filter by search
    if search:
        search_filter = f"%{search}%"
        stmt = stmt.where(
            Item.sku.ilike(search_filter) |
            Item.name.ilike(search_filter) |
            Item.barcode.like(search_filter)
        )
    
    # Filter by category
    if category and category.lower() != "all":
        stmt = stmt.where(Item.category == category.lower())
        
    # Filter by status
    if status and status.lower() != "all":
        stmt = stmt.where(Item.status == status.lower())
        
    # Count matching items
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one() or 0
    
    # Apply pagination limit/offset
    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)
    
    result = await db.execute(stmt)
    items = list(result.scalars().all())
    
    return items, total


async def get_items_summary(db: AsyncSession) -> dict:
    from app.modules.items.pricing import calculate_suggested_price
    from app.modules.metal_rates.models import MetalRate
    from app.modules.sales.models import SaleItem

    # Total items quantity across all statuses
    total_items_stmt = select(func.coalesce(func.sum(Item.quantity), 0))
    total_items = int((await db.execute(total_items_stmt)).scalar_one() or 0)

    # In stock items quantity
    in_stock_stmt = select(func.coalesce(func.sum(Item.quantity), 0)).where(Item.status == "in_stock")
    in_stock = int((await db.execute(in_stock_stmt)).scalar_one() or 0)

    # Unique items quantity (only in stock)
    unique_stmt = select(func.coalesce(func.sum(Item.quantity), 0)).where(Item.category == "unique").where(Item.status == "in_stock")
    unique_items = int((await db.execute(unique_stmt)).scalar_one() or 0)

    # Sold items quantity (summing quantities of sold items recorded in sale_items)
    sold_stmt = select(func.coalesce(func.sum(SaleItem.quantity), 0))
    sold_items = int((await db.execute(sold_stmt)).scalar_one() or 0)

    # Get metal rates
    rates_stmt = select(MetalRate).order_by(MetalRate.effective_from.desc())
    rates_result = await db.execute(rates_stmt)
    rates_list = rates_result.scalars().all()

    rates_dict = {}
    for r in rates_list:
        key = (r.metal.lower(), float(r.purity))
        if key not in rates_dict:
            rates_dict[key] = float(r.rate_per_gram)

    # Get all in stock items to compute suggested pricing values
    items_stmt = select(Item).where(Item.status == "in_stock")
    items_result = await db.execute(items_stmt)
    in_stock_items = items_result.scalars().all()

    items_925_count = 0
    for item in in_stock_items:
        metal_lower = item.metal.lower()
        purity = float(item.purity)
        if metal_lower == "silver" and purity == 92.5:
            items_925_count += int(item.quantity or 0)

    return {
        "total_items": total_items,
        "in_stock": in_stock,
        "unique_items": unique_items,
        "sold_items": sold_items,
        "items_925_count": items_925_count,
    }
