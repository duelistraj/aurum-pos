import secrets
import string
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.changelog.service import log_change
from app.modules.items.models import Item, ItemHistory
from app.modules.items.schemas import ItemBase, ItemCreate, ItemUpdate
from app.modules.subscriptions.service import enforce_item_activation_limit


def record_item_history(db: AsyncSession, item: Item, *, event_type: str) -> None:
    """Append an immutable inventory snapshot in the caller's transaction."""
    db.add(
        ItemHistory(
            shop_id=item.shop_id,
            item_id=item.id,
            event_type=event_type,
            sku=item.sku,
            category=item.category,
            metal=item.metal,
            purity=item.purity,
            net_weight=item.net_weight,
            making_charge=item.making_charge,
            quantity=item.quantity,
            status=item.status,
            effective_from=datetime.now(UTC),
        )
    )


async def generate_unique_barcode(db: AsyncSession, *, shop_id: UUID) -> str:
    """Generate a unique 8-digit barcode"""
    for _attempt in range(20):
        barcode = "".join(secrets.choice(string.digits) for _ in range(8))

        # Check if barcode already exists
        stmt = select(Item).where(
            Item.shop_id == shop_id,
            Item.barcode == barcode,
        )
        result = await db.execute(stmt)
        if not result.scalar_one_or_none():
            return barcode
    raise RuntimeError("Unable to generate a unique barcode")


async def create_item(db: AsyncSession, data: ItemCreate, *, shop_id: UUID) -> Item:
    item_data = data.model_dump()

    if item_data.get("quantity", 1) > 0:
        await enforce_item_activation_limit(db, shop_id)

    # Generate barcode if not provided
    if not item_data.get("barcode"):
        item_data["barcode"] = await generate_unique_barcode(db, shop_id=shop_id)

    # If category is unique, always set net_weight to 0
    if item_data.get("category") == "unique":
        item_data["net_weight"] = 0

    item = Item(shop_id=shop_id, **item_data)
    db.add(item)
    await db.flush()
    record_item_history(db, item, event_type="create")

    await log_change(
        db,
        shop_id=shop_id,
        entity="item",
        entity_id=item.id,
        action="create",
        payload={
            "sku": item.sku,
            "barcode": item.barcode,
        },
    )

    await db.flush()
    await db.refresh(item)
    return item


async def update_item(db: AsyncSession, item_id: UUID, data: ItemUpdate, *, shop_id: UUID) -> Item:
    item = await get_item_by_id(db, item_id, shop_id=shop_id, for_update=True)
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

    requested_updates = data.model_dump(exclude_unset=True)
    requested_quantity = requested_updates.get("quantity")
    if item.quantity <= 0 and requested_quantity is not None and requested_quantity > 0:
        await enforce_item_activation_limit(db, shop_id)
    current_item_data = {
        "sku": item.sku,
        "barcode": item.barcode,
        "category": item.category,
        "name": item.name,
        "metal": item.metal,
        "purity": item.purity,
        "net_weight": item.net_weight,
        "making_charge": item.making_charge,
        "quantity": item.quantity,
        "notes": item.notes,
    }
    validated_item = ItemBase.model_validate({**current_item_data, **requested_updates})
    validated_data = validated_item.model_dump()
    fields_to_update = set(requested_updates)
    if "category" in fields_to_update and validated_item.category == "unique":
        fields_to_update.add("net_weight")
    item_data = {field: validated_data[field] for field in fields_to_update}

    # Remove status from tracking if it exists
    item_data_for_logging = {k: v for k, v in item_data.items() if k != "status"}

    # Convert float values for logging
    if "purity" in item_data_for_logging and item_data_for_logging["purity"] is not None:
        item_data_for_logging["purity"] = float(item_data_for_logging["purity"])
    if "net_weight" in item_data_for_logging and item_data_for_logging["net_weight"] is not None:
        item_data_for_logging["net_weight"] = float(item_data_for_logging["net_weight"])
    if (
        "making_charge" in item_data_for_logging
        and item_data_for_logging["making_charge"] is not None
    ):
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

    # Apply changes to the item
    for field, value in item_data.items():
        setattr(item, field, value)
    record_item_history(db, item, event_type="update")

    # Only log if there are actual changes (excluding status)
    if changes:
        await log_change(
            db,
            shop_id=shop_id,
            entity="item",
            entity_id=item.id,
            action="update",
            payload={
                "barcode": item.barcode,
                "changes": changes,
            },
        )

    await db.flush()
    await db.refresh(item)
    return item


async def delete_item(db: AsyncSession, item_id: UUID, *, shop_id: UUID) -> None:
    item = await get_item_by_id(db, item_id, shop_id=shop_id, for_update=True)
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
        shop_id=shop_id,
        entity="item",
        entity_id=item.id,
        action="delete",
        payload=payload,
    )
    item.quantity = 0
    item.status = "archived"
    item.archived_at = datetime.now(UTC)
    record_item_history(db, item, event_type="archive")
    await db.flush()


async def get_item_by_id(
    db: AsyncSession,
    item_id: UUID,
    *,
    shop_id: UUID,
    for_update: bool = False,
) -> Item | None:
    stmt = select(Item).where(
        Item.id == item_id,
        Item.shop_id == shop_id,
        Item.archived_at.is_(None),
    )
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_item_by_barcode(
    db: AsyncSession,
    barcode: str,
    *,
    shop_id: UUID,
) -> Item | None:
    stmt = select(Item).where(
        Item.barcode == barcode,
        Item.shop_id == shop_id,
        Item.archived_at.is_(None),
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_items(db: AsyncSession, *, shop_id: UUID) -> list[Item]:
    stmt = (
        select(Item)
        .where(
            Item.shop_id == shop_id,
            Item.status == "in_stock",
            Item.archived_at.is_(None),
        )
        .order_by(Item.updated_at.desc())
    )

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_latest_item(db: AsyncSession, *, shop_id: UUID) -> Item | None:
    stmt = (
        select(Item)
        .where(Item.shop_id == shop_id, Item.archived_at.is_(None))
        .order_by(Item.updated_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_item_for_pos_by_barcode(
    db: AsyncSession,
    barcode: str,
    *,
    shop_id: UUID,
) -> Item | None:
    stmt = (
        select(Item)
        .where(
            Item.barcode == barcode,
            Item.shop_id == shop_id,
            Item.status == "in_stock",
            Item.archived_at.is_(None),
        )
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_items_for_label_printing(
    db: AsyncSession,
    *,
    shop_id: UUID,
    only_in_stock: bool = True,
    max_items: int = 501,
):
    stmt = select(Item).where(Item.shop_id == shop_id, Item.archived_at.is_(None))

    if only_in_stock:
        stmt = stmt.where(Item.status == "in_stock")

    stmt = stmt.order_by(Item.updated_at.desc()).limit(max_items)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_items_paginated(
    db: AsyncSession,
    *,
    shop_id: UUID,
    page: int = 1,
    limit: int = 10,
    search: str | None = None,
    category: str | None = None,
    status: str | None = None,
    metal: str | None = None,
) -> tuple[list[Item], int]:
    stmt = (
        select(Item)
        .where(Item.shop_id == shop_id, Item.archived_at.is_(None))
        .order_by(Item.updated_at.desc())
    )

    # Filter by search
    if search:
        normalized_search = search.strip().lower()
        search_filter = f"%{normalized_search}%"
        stmt = stmt.where(
            func.lower(Item.sku).like(search_filter)
            | func.lower(Item.name).like(search_filter)
            | Item.barcode.startswith(search.strip())
        )

    # Filter by category
    if category and category.lower() != "all":
        stmt = stmt.where(Item.category == category.lower())

    # Filter by status
    if status and status.lower() != "all":
        stmt = stmt.where(Item.status == status.lower())

    if metal and metal.lower() != "all":
        stmt = stmt.where(func.lower(Item.metal) == metal.lower())

    # Count matching items
    count_stmt = select(func.count(Item.id)).where(
        Item.shop_id == shop_id,
        Item.archived_at.is_(None),
    )
    if search:
        count_stmt = count_stmt.where(
            func.lower(Item.sku).like(search_filter)
            | func.lower(Item.name).like(search_filter)
            | Item.barcode.startswith(search.strip())
        )
    if category and category.lower() != "all":
        count_stmt = count_stmt.where(Item.category == category.lower())
    if status and status.lower() != "all":
        count_stmt = count_stmt.where(Item.status == status.lower())
    if metal and metal.lower() != "all":
        count_stmt = count_stmt.where(func.lower(Item.metal) == metal.lower())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one() or 0

    # Apply pagination limit/offset
    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    items = list(result.scalars().all())

    return items, total


async def get_items_summary(db: AsyncSession, *, shop_id: UUID) -> dict:
    from app.modules.sales.models import SaleItem

    sold_items = (
        select(func.coalesce(func.sum(SaleItem.quantity), 0))
        .where(SaleItem.shop_id == shop_id)
        .scalar_subquery()
    )
    stmt = select(
        func.coalesce(func.sum(Item.quantity), 0),
        func.coalesce(
            func.sum(case((Item.status == "in_stock", Item.quantity), else_=0)),
            0,
        ),
        func.coalesce(
            func.sum(
                case(
                    (
                        (Item.category == "unique") & (Item.status == "in_stock"),
                        Item.quantity,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
        func.coalesce(
            func.sum(
                case(
                    (
                        (func.lower(Item.metal) == "silver")
                        & (Item.purity == 92.5)
                        & (Item.status == "in_stock"),
                        Item.quantity,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
        sold_items,
    ).where(Item.shop_id == shop_id)
    total_items, in_stock, unique_items, items_925_count, sold_count = (
        await db.execute(stmt)
    ).one()

    return {
        "total_items": int(total_items),
        "in_stock": int(in_stock),
        "unique_items": int(unique_items),
        "sold_items": int(sold_count),
        "items_925_count": int(items_925_count),
    }
