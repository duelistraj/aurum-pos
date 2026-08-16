import hashlib
import json
from collections import defaultdict
from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.changelog.service import AuditActor, log_change
from app.core.config import settings
from app.modules.items.models import Item
from app.modules.items.service import record_item_history
from app.modules.storefront.models import (
    StorefrontInventoryEvent,
    StorefrontReservation,
    StorefrontReservationLine,
)
from app.modules.storefront.schemas import (
    InventoryStateOut,
    ReservationCreate,
    ReservationOut,
    ReservationStatus,
)

ACTIVE_RESERVATION_STATUSES = frozenset({"held", "confirmed"})


def _normalized_request_hash(data: ReservationCreate) -> str:
    normalized_lines = sorted(
        ({"item_id": str(line.item_id), "quantity": line.quantity} for line in data.lines),
        key=lambda line: str(line["item_id"]),
    )
    payload = {
        "external_order_id": data.external_order_id,
        "expires_at": data.expires_at.astimezone(UTC).isoformat(),
        "lines": normalized_lines,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


async def reserved_quantity_by_item(
    db: AsyncSession,
    *,
    shop_id: UUID,
    item_ids: list[UUID],
) -> dict[UUID, int]:
    if not item_ids:
        return {}
    now = datetime.now(UTC)
    rows = await db.execute(
        select(
            StorefrontReservationLine.item_id,
            func.sum(StorefrontReservationLine.quantity),
        )
        .join(
            StorefrontReservation,
            (StorefrontReservation.id == StorefrontReservationLine.reservation_id)
            & (StorefrontReservation.shop_id == StorefrontReservationLine.shop_id),
        )
        .where(
            StorefrontReservationLine.shop_id == shop_id,
            StorefrontReservationLine.item_id.in_(item_ids),
            StorefrontReservation.status.in_(ACTIVE_RESERVATION_STATUSES),
            or_(
                StorefrontReservation.status == "confirmed",
                StorefrontReservation.expires_at > now,
            ),
        )
        .group_by(StorefrontReservationLine.item_id)
    )
    return {item_id: int(quantity or 0) for item_id, quantity in rows}


async def inventory_states(
    db: AsyncSession,
    *,
    shop_id: UUID,
    items: list[Item],
) -> list[InventoryStateOut]:
    reserved_by_item = await reserved_quantity_by_item(
        db,
        shop_id=shop_id,
        item_ids=[item.id for item in items],
    )
    return [
        InventoryStateOut(
            item_id=item.id,
            on_hand_quantity=item.quantity,
            reserved_quantity=reserved_by_item.get(item.id, 0),
            available_quantity=max(item.quantity - reserved_by_item.get(item.id, 0), 0),
            status=item.status,
            inventory_version=item.inventory_version,
        )
        for item in items
    ]


def queue_inventory_event(
    db: AsyncSession,
    *,
    item: Item,
    reserved_quantity: int,
    source: str,
) -> None:
    if not settings.storefront_integration_enabled or item.shop_id != settings.storefront_shop_id:
        return
    event_id = uuid4()
    available_quantity = max(item.quantity - reserved_quantity, 0)
    db.add(
        StorefrontInventoryEvent(
            id=event_id,
            shop_id=item.shop_id,
            item_id=item.id,
            payload={
                "event_id": str(event_id),
                "event_type": "inventory.changed.v1",
                "shop_id": str(item.shop_id),
                "item_id": str(item.id),
                "source": source,
                "on_hand_quantity": item.quantity,
                "reserved_quantity": reserved_quantity,
                "available_quantity": available_quantity,
                "status": item.status,
                "inventory_version": item.inventory_version,
                "occurred_at": datetime.now(UTC).isoformat(),
            },
        )
    )


def apply_availability_status(item: Item, *, reserved_quantity: int) -> None:
    available_quantity = item.quantity - reserved_quantity
    if item.quantity <= 0:
        item.quantity = 0
        item.status = "sold"
    elif available_quantity <= 0:
        item.status = "reserved"
    else:
        item.status = "in_stock"
    item.inventory_version += 1


async def _locked_items(
    db: AsyncSession,
    *,
    shop_id: UUID,
    item_ids: list[UUID],
) -> list[Item]:
    items = list(
        await db.scalars(
            select(Item)
            .where(
                Item.shop_id == shop_id,
                Item.id.in_(item_ids),
                Item.archived_at.is_(None),
            )
            .order_by(Item.id)
            .with_for_update()
        )
    )
    if len(items) != len(item_ids):
        raise HTTPException(status_code=409, detail="One or more items are unavailable")
    return items


async def reservation_response(
    db: AsyncSession,
    *,
    reservation: StorefrontReservation,
) -> ReservationOut:
    items = await _locked_items(
        db,
        shop_id=reservation.shop_id,
        item_ids=[line.item_id for line in reservation.lines],
    )
    return ReservationOut(
        reservation_id=reservation.id,
        external_order_id=reservation.external_order_id,
        status=cast(ReservationStatus, reservation.status),
        expires_at=reservation.expires_at,
        items=await inventory_states(db, shop_id=reservation.shop_id, items=items),
    )


async def create_reservation(
    db: AsyncSession,
    *,
    shop_id: UUID,
    data: ReservationCreate,
) -> ReservationOut:
    if data.expires_at.astimezone(UTC) <= datetime.now(UTC):
        raise HTTPException(status_code=422, detail="Reservation expiry must be in the future")
    quantity_by_item: dict[UUID, int] = defaultdict(int)
    for line in data.lines:
        quantity_by_item[line.item_id] += line.quantity
    item_ids = sorted(quantity_by_item)
    request_hash = _normalized_request_hash(data)
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"storefront-reservation:{shop_id}:{data.external_order_id}"},
    )
    existing = await db.scalar(
        select(StorefrontReservation).where(
            StorefrontReservation.shop_id == shop_id,
            StorefrontReservation.external_order_id == data.external_order_id,
        )
    )
    if existing is not None:
        if existing.request_hash != request_hash:
            raise HTTPException(status_code=409, detail="External order ID was reused")
        return await reservation_response(db, reservation=existing)

    items = await _locked_items(db, shop_id=shop_id, item_ids=item_ids)
    reserved_by_item = await reserved_quantity_by_item(db, shop_id=shop_id, item_ids=item_ids)
    for item in items:
        if item.stock_mode != "quantity" or item.status not in {"in_stock", "reserved"}:
            raise HTTPException(status_code=409, detail=f"Item {item.sku} is unavailable")
        available = item.quantity - reserved_by_item.get(item.id, 0)
        if available < quantity_by_item[item.id]:
            raise HTTPException(
                status_code=409,
                detail=f"Item {item.sku} does not have enough available stock",
            )

    reservation = StorefrontReservation(
        shop_id=shop_id,
        external_order_id=data.external_order_id,
        request_hash=request_hash,
        expires_at=data.expires_at,
    )
    reservation.lines = [
        StorefrontReservationLine(
            shop_id=shop_id,
            item_id=item_id,
            quantity=quantity_by_item[item_id],
        )
        for item_id in item_ids
    ]
    db.add(reservation)
    await db.flush()
    for item in items:
        reserved_quantity = reserved_by_item.get(item.id, 0) + quantity_by_item[item.id]
        apply_availability_status(item, reserved_quantity=reserved_quantity)
        record_item_history(db, item, event_type="reservation")
        queue_inventory_event(
            db,
            item=item,
            reserved_quantity=reserved_quantity,
            source="storefront.reservation_held",
        )
    await log_change(
        db,
        shop_id=shop_id,
        entity="storefront_reservation",
        entity_id=reservation.id,
        action="create",
        event_type="storefront.reservation_held",
        subject_label=data.external_order_id,
        reference=data.external_order_id,
        payload={"external_order_id": data.external_order_id, "item_count": len(item_ids)},
        actor=AuditActor.system(),
    )
    return await reservation_response(db, reservation=reservation)


async def transition_reservation(
    db: AsyncSession,
    *,
    shop_id: UUID,
    reservation_id: UUID,
    action: str,
) -> ReservationOut:
    reservation = await db.scalar(
        select(StorefrontReservation)
        .where(
            StorefrontReservation.id == reservation_id,
            StorefrontReservation.shop_id == shop_id,
        )
        .with_for_update()
    )
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    target_status_by_action = {
        "confirm": "confirmed",
        "release": "released",
        "fulfill": "fulfilled",
    }
    target_status = target_status_by_action[action]
    if reservation.status == target_status:
        return await reservation_response(db, reservation=reservation)
    if (
        action == "confirm"
        and reservation.status == "held"
        and reservation.expires_at is not None
        and reservation.expires_at <= datetime.now(UTC)
    ):
        raise HTTPException(status_code=409, detail="Reservation has expired")
    allowed_by_action = {
        "confirm": {"held"},
        "release": {"held", "confirmed"},
        "fulfill": {"confirmed"},
    }
    if reservation.status not in allowed_by_action[action]:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot {action} a {reservation.status} reservation",
        )

    items = await _locked_items(
        db,
        shop_id=shop_id,
        item_ids=[line.item_id for line in reservation.lines],
    )
    now = datetime.now(UTC)
    if action == "confirm":
        reservation.status = "confirmed"
        reservation.expires_at = None
        reservation.confirmed_at = now
    elif action == "release":
        reservation.status = "released"
        reservation.released_at = now
    else:
        reservation.status = "fulfilled"
        reservation.fulfilled_at = now
    await db.flush()

    quantity_by_item = {line.item_id: line.quantity for line in reservation.lines}
    reserved_by_item = await reserved_quantity_by_item(
        db,
        shop_id=shop_id,
        item_ids=[item.id for item in items],
    )
    if action != "confirm":
        for item in items:
            if action == "fulfill":
                item.quantity -= quantity_by_item[item.id]
            reserved_quantity = reserved_by_item.get(item.id, 0)
            apply_availability_status(item, reserved_quantity=reserved_quantity)
            record_item_history(
                db,
                item,
                event_type="storefront_fulfillment" if action == "fulfill" else "reservation",
            )
            queue_inventory_event(
                db,
                item=item,
                reserved_quantity=reserved_quantity,
                source=f"storefront.reservation_{target_status}",
            )
    await log_change(
        db,
        shop_id=shop_id,
        entity="storefront_reservation",
        entity_id=reservation.id,
        action=action,
        event_type=f"storefront.reservation_{target_status}",
        subject_label=reservation.external_order_id,
        reference=reservation.external_order_id,
        payload={"external_order_id": reservation.external_order_id},
        actor=AuditActor.system(),
    )
    return await reservation_response(db, reservation=reservation)


async def expire_held_reservations(db: AsyncSession, *, shop_id: UUID) -> int:
    now = datetime.now(UTC)
    reservations = list(
        await db.scalars(
            select(StorefrontReservation)
            .where(
                StorefrontReservation.shop_id == shop_id,
                StorefrontReservation.status == "held",
                StorefrontReservation.expires_at <= now,
            )
            .order_by(StorefrontReservation.expires_at, StorefrontReservation.id)
            .with_for_update(skip_locked=True)
        )
    )
    for reservation in reservations:
        items = await _locked_items(
            db,
            shop_id=shop_id,
            item_ids=sorted(line.item_id for line in reservation.lines),
        )
        reservation.status = "expired"
        reservation.released_at = now
        await db.flush()
        reserved_by_item = await reserved_quantity_by_item(
            db,
            shop_id=shop_id,
            item_ids=[item.id for item in items],
        )
        for item in items:
            reserved_quantity = reserved_by_item.get(item.id, 0)
            apply_availability_status(item, reserved_quantity=reserved_quantity)
            record_item_history(db, item, event_type="reservation")
            queue_inventory_event(
                db,
                item=item,
                reserved_quantity=reserved_quantity,
                source="storefront.reservation_expired",
            )
        await log_change(
            db,
            shop_id=shop_id,
            entity="storefront_reservation",
            entity_id=reservation.id,
            action="expire",
            event_type="storefront.reservation_expired",
            subject_label=reservation.external_order_id,
            reference=reservation.external_order_id,
            payload={"external_order_id": reservation.external_order_id},
            actor=AuditActor.system(),
        )
    return len(reservations)
