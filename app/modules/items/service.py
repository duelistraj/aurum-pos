import secrets
import string
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.changelog.service import log_change
from app.modules.items.models import Item, ItemHistory
from app.modules.items.schemas import ItemBase, ItemCreate, ItemUpdate
from app.modules.subscriptions.service import enforce_item_activation_limit


def reconcile_remaining_weight(
    *,
    current_total: Decimal,
    current_remaining: Decimal,
    new_total: Decimal,
) -> Decimal:
    consumed_weight = current_total - current_remaining
    if new_total <= 0:
        raise ValueError("Total weight must be greater than 0")
    if new_total < consumed_weight:
        raise ValueError("Total weight cannot be less than consumed weight")
    return new_total - consumed_weight


def record_item_history(db: AsyncSession, item: Item, *, event_type: str) -> None:
    """Append an immutable inventory snapshot in the caller's transaction."""
    db.add(
        ItemHistory(
            shop_id=item.shop_id,
            item_id=item.id,
            event_type=event_type,
            sku=item.sku,
            category=item.category,
            item_type=item.item_type,
            pricing_method=item.pricing_method,
            stock_mode=item.stock_mode,
            metal=item.metal,
            purity=item.purity,
            net_weight=item.net_weight,
            making_charge=item.making_charge,
            fixed_rate=item.fixed_rate,
            stock_weight=item.stock_weight,
            ratti=item.ratti,
            rate_per_ratti=item.rate_per_ratti,
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
        "item_type": item.item_type,
        "pricing_method": item.pricing_method,
        "stock_mode": item.stock_mode,
        "name": item.name,
        "metal": item.metal,
        "purity": float(item.purity),
        "net_weight": float(item.net_weight),
        "making_charge": float(item.making_charge) if item.making_charge is not None else None,
        "fixed_rate": float(item.fixed_rate),
        "stock_weight": float(item.stock_weight) if item.stock_weight is not None else None,
        "ratti": float(item.ratti) if item.ratti is not None else None,
        "rate_per_ratti": float(item.rate_per_ratti) if item.rate_per_ratti is not None else None,
        "quantity": item.quantity,
        "notes": item.notes,
    }

    requested_updates = data.model_dump(exclude_unset=True)
    if "item_type" in requested_updates and requested_updates["item_type"] != item.item_type:
        raise ValueError("Item type cannot be changed after creation")
    if "stock_mode" in requested_updates and requested_updates["stock_mode"] != item.stock_mode:
        from app.modules.sales.models import SaleItem

        has_sale = await db.scalar(
            select(SaleItem.id)
            .where(
                SaleItem.shop_id == shop_id,
                SaleItem.item_id == item.id,
            )
            .limit(1)
        )
        if has_sale is not None:
            raise ValueError("Stock mode cannot be changed after the item has been sold")
    target_stock_mode = requested_updates.get("stock_mode", item.stock_mode)
    if target_stock_mode == "weight":
        requested_stock_weight = requested_updates.get("stock_weight")
        if item.stock_mode == "weight":
            current_remaining = item.stock_weight or Decimal(0)
            if (
                "stock_weight" in requested_updates
                and "net_weight" not in requested_updates
                and requested_stock_weight != current_remaining
            ):
                raise ValueError("Remaining weight cannot be edited directly")
            total_weight = Decimal(str(requested_updates.get("net_weight", item.net_weight)))
            remaining_weight = reconcile_remaining_weight(
                current_total=item.net_weight,
                current_remaining=current_remaining,
                new_total=total_weight,
            )
        else:
            total_value = requested_updates.get("net_weight") or requested_stock_weight or 0
            total_weight = Decimal(str(total_value))
            remaining_weight = reconcile_remaining_weight(
                current_total=Decimal(0),
                current_remaining=Decimal(0),
                new_total=total_weight,
            )
        requested_updates.update(
            net_weight=total_weight,
            stock_weight=remaining_weight,
            quantity=1 if remaining_weight > 0 else 0,
        )
    requested_quantity = requested_updates.get("quantity")
    if item.quantity <= 0 and requested_quantity is not None and requested_quantity > 0:
        await enforce_item_activation_limit(db, shop_id)
    current_item_data = {
        "sku": item.sku,
        "barcode": item.barcode,
        "category": item.category,
        "item_type": item.item_type,
        "pricing_method": item.pricing_method,
        "stock_mode": item.stock_mode,
        "name": item.name,
        "metal": item.metal,
        "purity": item.purity,
        "net_weight": item.net_weight,
        "making_charge": item.making_charge,
        "fixed_rate": item.fixed_rate,
        "stock_weight": item.stock_weight,
        "ratti": item.ratti,
        "rate_per_ratti": item.rate_per_ratti,
        "quantity": item.quantity,
        "notes": item.notes,
    }
    validated_item = ItemBase.model_validate({**current_item_data, **requested_updates})
    validated_data = validated_item.model_dump()
    fields_to_update = set(requested_updates)
    if fields_to_update & {
        "category",
        "item_type",
        "pricing_method",
        "stock_mode",
        "net_weight",
    }:
        fields_to_update.update(
            {
                "metal",
                "purity",
                "net_weight",
                "making_charge",
                "fixed_rate",
                "stock_weight",
                "ratti",
                "rate_per_ratti",
                "quantity",
            }
        )
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
    if "fixed_rate" in item_data_for_logging and item_data_for_logging["fixed_rate"] is not None:
        item_data_for_logging["fixed_rate"] = float(item_data_for_logging["fixed_rate"])
    for decimal_field in ("stock_weight", "ratti", "rate_per_ratti"):
        if item_data_for_logging.get(decimal_field) is not None:
            item_data_for_logging[decimal_field] = float(item_data_for_logging[decimal_field])

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
    if item.stock_mode == "weight" and item.stock_weight == 0:
        item.status = "sold"
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


async def _archive_item(db: AsyncSession, item: Item, *, shop_id: UUID) -> None:
    payload = {
        "sku": item.sku,
        "barcode": item.barcode,
        "category": item.category,
        "item_type": item.item_type,
        "pricing_method": item.pricing_method,
        "stock_mode": item.stock_mode,
        "name": item.name,
        "metal": item.metal,
        "purity": float(item.purity),
        "net_weight": float(item.net_weight),
        "making_charge": float(item.making_charge) if item.making_charge is not None else None,
        "fixed_rate": float(item.fixed_rate),
        "stock_weight": float(item.stock_weight) if item.stock_weight is not None else None,
        "ratti": float(item.ratti) if item.ratti is not None else None,
        "rate_per_ratti": float(item.rate_per_ratti) if item.rate_per_ratti is not None else None,
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


async def delete_item(db: AsyncSession, item_id: UUID, *, shop_id: UUID) -> None:
    item = await get_item_by_id(db, item_id, shop_id=shop_id, for_update=True)
    if not item:
        raise ValueError("Item does not exist")
    if item.status != "in_stock":
        raise ValueError("Only in_stock items can be deleted")

    await _archive_item(db, item, shop_id=shop_id)
    await db.flush()


async def delete_items(
    db: AsyncSession,
    item_ids: list[UUID],
    *,
    shop_id: UUID,
) -> None:
    result = await db.execute(
        select(Item)
        .where(
            Item.id.in_(item_ids),
            Item.shop_id == shop_id,
            Item.archived_at.is_(None),
        )
        .with_for_update()
    )
    item_by_id = {item.id: item for item in result.scalars().all()}
    if len(item_by_id) != len(item_ids):
        raise ValueError("One or more selected items do not exist")

    non_deletable_items = [item for item in item_by_id.values() if item.status != "in_stock"]
    if non_deletable_items:
        raise ValueError("Only in_stock items can be deleted")

    for item_id in item_ids:
        await _archive_item(db, item_by_id[item_id], shop_id=shop_id)

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

    sold_stock_mode = func.coalesce(SaleItem.item_stock_mode, Item.stock_mode)
    sold_items = (
        select(
            func.coalesce(
                func.sum(case((sold_stock_mode != "weight", SaleItem.quantity), else_=0)),
                0,
            )
            + func.count(
                func.distinct(
                    case(
                        (
                            (sold_stock_mode == "weight") & (Item.status == "sold"),
                            SaleItem.item_id,
                        )
                    )
                )
            )
        )
        .select_from(SaleItem)
        .outerjoin(
            Item,
            (Item.id == SaleItem.item_id) & (Item.shop_id == SaleItem.shop_id),
        )
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

    inventory_rows = (
        await db.execute(
            select(
                func.lower(Item.metal),
                Item.purity,
                func.coalesce(
                    func.sum(case((Item.status == "in_stock", Item.quantity), else_=0)), 0
                ),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                (Item.status == "in_stock") & (Item.category == "unique"),
                                Item.quantity,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ),
            )
            .where(Item.shop_id == shop_id, Item.archived_at.is_(None))
            .group_by(func.lower(Item.metal), Item.purity)
        )
    ).all()
    sold_rows = (
        await db.execute(
            select(
                func.lower(func.coalesce(SaleItem.item_metal, Item.metal)),
                func.coalesce(
                    func.sum(case((sold_stock_mode != "weight", SaleItem.quantity), else_=0)),
                    0,
                )
                + func.count(
                    func.distinct(
                        case(
                            (
                                (sold_stock_mode == "weight") & (Item.status == "sold"),
                                SaleItem.item_id,
                            )
                        )
                    )
                ),
            )
            .select_from(SaleItem)
            .outerjoin(
                Item,
                (Item.id == SaleItem.item_id) & (Item.shop_id == SaleItem.shop_id),
            )
            .where(SaleItem.shop_id == shop_id)
            .group_by(func.lower(func.coalesce(SaleItem.item_metal, Item.metal)))
        )
    ).all()
    metal_summaries: dict[str, dict[str, Any]] = {
        metal: {"in_stock": 0, "sold_items": 0, "unique_items": 0, "purity_counts": {}}
        for metal in ("gold", "silver", "platinum", "stone")
    }
    for metal, purity, stock_count, unique_count in inventory_rows:
        if metal not in metal_summaries:
            continue
        metal_summary = metal_summaries[metal]
        metal_summary["in_stock"] += int(stock_count)
        metal_summary["unique_items"] += int(unique_count)
        purity_key = format(float(purity), "g")
        metal_summary["purity_counts"][purity_key] = int(stock_count)
    for metal, metal_sold_count in sold_rows:
        if metal in metal_summaries:
            metal_summaries[metal]["sold_items"] = int(metal_sold_count)

    return {
        "total_items": int(total_items),
        "in_stock": int(in_stock),
        "unique_items": int(unique_items),
        "sold_items": int(sold_count),
        "items_925_count": int(items_925_count),
        "metal_summaries": metal_summaries,
    }
