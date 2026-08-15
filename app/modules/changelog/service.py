from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, exists, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.sql.elements import ColumnElement

from app.core.changelog.models import ChangeLog
from app.core.time import india_day_bounds
from app.modules.items.models import Item

EVENT_PRESENTATION: dict[str, tuple[str, str]] = {
    "inventory.item_created": ("Inventory", "Item created"),
    "inventory.item_updated": ("Inventory", "Item updated"),
    "inventory.item_archived": ("Inventory", "Item archived"),
    "sales.sale_completed": ("Sales", "Sale completed"),
    "rates.rate_created": ("Metal rates", "Rate created"),
    "rates.rate_updated": ("Metal rates", "Rate updated"),
    "shop.settings_updated": ("Shop", "Shop settings updated"),
    "team.invitation_issued": ("Team", "Invitation issued"),
    "team.invitation_accepted": ("Team", "Invitation accepted"),
    "team.member_updated": ("Team", "Member updated"),
    "team.ownership_transfer_requested": ("Team", "Ownership transfer requested"),
    "team.ownership_transfer_completed": ("Team", "Ownership transfer completed"),
}

OWNERSHIP_TRANSFER_EVENT_FILTER = "team.ownership_transfer"
OWNERSHIP_TRANSFER_EVENT_TYPES = (
    "team.ownership_transfer_requested",
    "team.ownership_transfer_completed",
)

SENSITIVE_PAYLOAD_FIELDS = {
    "customer_phone",
    "password",
    "password_hash",
    "token",
    "token_hash",
    "refresh_token",
}


def _humanize(value: str) -> str:
    return value.replace("_", " ").strip().title()


def _audit_event_filter(event_type: str) -> ColumnElement[bool]:
    if event_type == OWNERSHIP_TRANSFER_EVENT_FILTER:
        return ChangeLog.event_type.in_(OWNERSHIP_TRANSFER_EVENT_TYPES)
    return ChangeLog.event_type == event_type


def _safe_payload(payload: object) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    return {key: value for key, value in payload.items() if key not in SENSITIVE_PAYLOAD_FIELDS}


def _price_from_payload(payload: dict[str, Any]) -> float:
    pricing = payload.get("pricing")
    if not isinstance(pricing, dict):
        return 0.0
    for field in ("total_price", "final_price", "subtotal"):
        value = pricing.get(field)
        if isinstance(value, int | float):
            return float(value)
    return 0.0


def _serialize_sold_transaction(row: ChangeLog, item: Item | None) -> dict[str, Any]:
    payload = _safe_payload(row.payload)
    return {
        "id": row.id,
        "item_id": row.entity_id,
        "item_name": (
            item.name
            if item is not None
            else str(payload.get("item_name") or payload.get("name") or "Unknown item")
        ),
        "sku": item.sku if item is not None else payload.get("sku"),
        "barcode": row.barcode or payload.get("barcode"),
        "invoice_no": row.invoice_no or payload.get("invoice_no"),
        "quantity": payload.get("quantity"),
        "weight_grams": payload.get("weight_grams"),
        "amount": _price_from_payload(payload),
        "created_at": row.created_at or datetime.now(UTC),
    }


def _actor(row: ChangeLog) -> dict[str, Any]:
    if row.actor_kind == "user":
        return {
            "kind": "user",
            "user_id": row.actor_user_id,
            "name": row.actor_name or "Unknown user",
            "role": row.actor_role,
        }
    if row.actor_kind == "system":
        return {
            "kind": "system",
            "user_id": None,
            "name": "System",
            "role": None,
        }
    return {
        "kind": "unknown",
        "user_id": None,
        "name": "Unknown",
        "role": None,
    }


def _subject_label(row: ChangeLog, payload: dict[str, Any]) -> str:
    if row.subject_label:
        return row.subject_label
    if row.event_type == "sales.sale_completed":
        return f"Invoice {row.invoice_no or payload.get('invoice_no') or 'Unknown'}"
    if row.entity == "metal_rate":
        metal = str(payload.get("metal") or "Metal").title()
        purity = payload.get("purity")
        return f"{metal} {purity}%" if purity is not None else metal
    return str(
        payload.get("name")
        or payload.get("sku")
        or row.barcode
        or payload.get("barcode")
        or _humanize(row.entity)
    )


def _changes(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw_changes = payload.get("changes")
    if not isinstance(raw_changes, dict):
        return []
    result = []
    for field, raw_value in raw_changes.items():
        value = raw_value if isinstance(raw_value, dict) else {}
        result.append(
            {
                "field": field,
                "label": _humanize(field),
                "before": value.get("before"),
                "after": value.get("after", raw_value if not value else None),
            }
        )
    return result


def _facts(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"label": _humanize(key), "value": value}
        for key, value in payload.items()
        if key not in {"changes", "pricing", "invoice_no"} and not isinstance(value, dict | list)
    ]


def _summary(
    row: ChangeLog,
    *,
    subject_label: str,
    changes: list[dict[str, Any]],
    sale_items: list[dict[str, Any]],
) -> str:
    if row.event_type == "inventory.item_created":
        return f"Added {subject_label}"
    if row.event_type == "inventory.item_updated":
        count = len(changes)
        return f"Changed {count} field{'s' if count != 1 else ''}"
    if row.event_type == "inventory.item_archived":
        return f"Archived {subject_label}"
    if row.event_type == "sales.sale_completed":
        count = len(sale_items)
        return f"{count} item{'s' if count != 1 else ''} sold"
    if row.event_type.startswith("rates."):
        return subject_label
    event_label = EVENT_PRESENTATION.get(row.event_type, ("Other", _humanize(row.action)))[1]
    return event_label


def _serialize_audit_entry(
    row: ChangeLog,
    *,
    sale_items: list[dict[str, Any]],
) -> dict[str, Any]:
    payload = _safe_payload(row.payload)
    changes = _changes(payload)
    facts = _facts(payload)
    subject_label = _subject_label(row, payload)
    area, _event_label = EVENT_PRESENTATION.get(
        row.event_type,
        (_humanize(row.event_type.split(".", 1)[0]), _humanize(row.action)),
    )
    if row.event_type == "sales.sale_completed":
        detail_kind = "sale"
    elif changes:
        detail_kind = "changes"
    else:
        detail_kind = "facts"
    total = payload.get("total")
    return {
        "id": row.id,
        "event_type": row.event_type,
        "area": area,
        "subject": {
            "type": row.entity,
            "id": row.entity_id,
            "label": subject_label,
            "reference": row.reference or row.invoice_no or row.barcode,
        },
        "actor": _actor(row),
        "summary": _summary(
            row,
            subject_label=subject_label,
            changes=changes,
            sale_items=sale_items,
        ),
        "details": {
            "kind": detail_kind,
            "changes": changes,
            "facts": facts,
            "sale_items": sale_items,
            "total": float(total) if isinstance(total, int | float) else None,
        },
        "created_at": row.created_at or datetime.now(UTC),
    }


async def _sale_items_for_rows(
    db: AsyncSession,
    *,
    shop_id: UUID,
    invoice_numbers: Iterable[str],
) -> dict[str, list[dict[str, Any]]]:
    invoice_numbers = list(invoice_numbers)
    if not invoice_numbers:
        return {}
    result = await db.execute(
        select(ChangeLog, Item)
        .outerjoin(
            Item,
            and_(Item.id == ChangeLog.entity_id, Item.shop_id == ChangeLog.shop_id),
        )
        .where(
            ChangeLog.shop_id == shop_id,
            ChangeLog.event_type == "sales.item_sold",
            ChangeLog.invoice_no.in_(invoice_numbers),
        )
        .order_by(ChangeLog.created_at, ChangeLog.id)
    )
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row, item in result.all():
        if row.invoice_no is None:
            continue
        sold_item = _serialize_sold_transaction(row, item)
        grouped.setdefault(row.invoice_no, []).append(
            {
                "item_id": sold_item["item_id"],
                "name": sold_item["item_name"],
                "sku": sold_item["sku"],
                "barcode": sold_item["barcode"],
                "quantity": sold_item["quantity"],
                "weight_grams": sold_item["weight_grams"],
                "amount": sold_item["amount"],
            }
        )
    return grouped


async def get_audit_log_history(
    db: AsyncSession,
    *,
    shop_id: UUID,
    search: str | None = None,
    event_type: str | None = None,
    actor_user_id: UUID | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = 1,
    limit: int = 25,
) -> dict[str, Any]:
    sold_alias = aliased(ChangeLog)
    filters = [
        ChangeLog.shop_id == shop_id,
        not_(
            and_(
                ChangeLog.entity == "item",
                ChangeLog.action == "sold",
            )
        ),
    ]
    if from_date is not None:
        filters.append(ChangeLog.created_at >= from_date)
    if to_date is not None:
        filters.append(ChangeLog.created_at <= to_date)
    if event_type:
        filters.append(_audit_event_filter(event_type))
    if actor_user_id:
        filters.append(ChangeLog.actor_user_id == actor_user_id)
    if search and (term := search.strip()):
        pattern = f"%{term}%"
        sold_item_match = or_(
            sold_alias.barcode.ilike(pattern),
            sold_alias.subject_label.ilike(pattern),
            sold_alias.payload["sku"].as_string().ilike(pattern),
            sold_alias.payload["item_name"].as_string().ilike(pattern),
        )
        filters.append(
            or_(
                ChangeLog.reference.ilike(pattern),
                ChangeLog.subject_label.ilike(pattern),
                ChangeLog.barcode.ilike(pattern),
                ChangeLog.invoice_no.ilike(pattern),
                ChangeLog.payload["sku"].as_string().ilike(pattern),
                ChangeLog.payload["item_name"].as_string().ilike(pattern),
                and_(
                    ChangeLog.event_type == "sales.sale_completed",
                    exists(
                        select(sold_alias.id).where(
                            sold_alias.shop_id == ChangeLog.shop_id,
                            sold_alias.invoice_no == ChangeLog.invoice_no,
                            sold_alias.event_type == "sales.item_sold",
                            sold_item_match,
                        )
                    ),
                ),
            )
        )

    total = int(await db.scalar(select(func.count(ChangeLog.id)).where(*filters)) or 0)
    rows = list(
        await db.scalars(
            select(ChangeLog)
            .where(*filters)
            .order_by(ChangeLog.created_at.desc(), ChangeLog.id.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    )
    sale_items_by_invoice = await _sale_items_for_rows(
        db,
        shop_id=shop_id,
        invoice_numbers=[
            row.invoice_no
            for row in rows
            if row.event_type == "sales.sale_completed" and row.invoice_no
        ],
    )
    return {
        "entries": [
            _serialize_audit_entry(
                row,
                sale_items=sale_items_by_invoice.get(row.invoice_no or "", []),
            )
            for row in rows
        ],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


async def get_audit_actor_options(
    db: AsyncSession,
    *,
    shop_id: UUID,
) -> list[dict[str, Any]]:
    ranked_actors = (
        select(
            ChangeLog.actor_user_id.label("user_id"),
            ChangeLog.actor_name.label("name"),
            ChangeLog.actor_role.label("role"),
            func.row_number()
            .over(
                partition_by=ChangeLog.actor_user_id,
                order_by=(ChangeLog.created_at.desc(), ChangeLog.id.desc()),
            )
            .label("rank"),
        )
        .where(
            ChangeLog.shop_id == shop_id,
            ChangeLog.actor_kind == "user",
            ChangeLog.actor_user_id.is_not(None),
        )
        .subquery()
    )
    rows = (
        await db.execute(
            select(ranked_actors.c.user_id, ranked_actors.c.name, ranked_actors.c.role)
            .where(ranked_actors.c.rank == 1)
            .order_by(func.lower(ranked_actors.c.name), ranked_actors.c.user_id)
        )
    ).all()
    return [
        {"user_id": user_id, "name": name or "Unknown user", "role": role}
        for user_id, name, role in rows
    ]


async def get_sold_transaction_history(
    db: AsyncSession,
    *,
    shop_id: UUID,
    search: str | None = None,
    page: int = 1,
    limit: int = 25,
) -> dict[str, Any]:
    _, start, end = india_day_bounds()
    filters = [
        ChangeLog.shop_id == shop_id,
        ChangeLog.event_type == "sales.item_sold",
        ChangeLog.created_at >= start,
        ChangeLog.created_at < end,
    ]
    if search and (term := search.strip()):
        pattern = f"%{term}%"
        filters.append(
            or_(
                ChangeLog.barcode.ilike(pattern),
                ChangeLog.invoice_no.ilike(pattern),
                ChangeLog.subject_label.ilike(pattern),
                ChangeLog.payload["sku"].as_string().ilike(pattern),
                ChangeLog.payload["item_name"].as_string().ilike(pattern),
            )
        )

    total = int(await db.scalar(select(func.count(ChangeLog.id)).where(*filters)) or 0)
    result = await db.execute(
        select(ChangeLog, Item)
        .outerjoin(
            Item,
            and_(Item.id == ChangeLog.entity_id, Item.shop_id == ChangeLog.shop_id),
        )
        .where(*filters)
        .order_by(ChangeLog.created_at.desc(), ChangeLog.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    return {
        "entries": [_serialize_sold_transaction(row, item) for row, item in result.all()],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }
