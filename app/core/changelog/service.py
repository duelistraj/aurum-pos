from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.changelog.models import ChangeLog

LEGACY_EVENT_TYPES = {
    ("item", "create"): "inventory.item_created",
    ("item", "update"): "inventory.item_updated",
    ("item", "delete"): "inventory.item_archived",
    ("item", "sold"): "sales.item_sold",
    ("sale", "create"): "sales.sale_completed",
    ("metal_rate", "create"): "rates.rate_created",
    ("metal_rate", "update"): "rates.rate_updated",
}


@dataclass(frozen=True)
class AuditActor:
    kind: Literal["user", "system"]
    user_id: UUID | None = None
    name: str | None = None
    role: str | None = None

    @classmethod
    def user(cls, *, user_id: UUID, name: str, role: str) -> "AuditActor":
        return cls(kind="user", user_id=user_id, name=name[:100], role=role[:20])

    @classmethod
    def system(cls) -> "AuditActor":
        return cls(kind="system", name="System")


async def log_change(
    db: AsyncSession,
    *,
    shop_id: UUID,
    entity: str,
    entity_id,
    action: str,
    payload: dict,
    actor: AuditActor | None = None,
    event_type: str | None = None,
    subject_label: str | None = None,
    reference: str | None = None,
):
    resolved_actor = actor or AuditActor.system()
    entry = ChangeLog(
        shop_id=shop_id,
        entity=entity,
        entity_id=entity_id,
        action=action,
        event_type=event_type
        or LEGACY_EVENT_TYPES.get(
            (entity, action),
            f"{entity}.{action}",
        ),
        subject_label=subject_label,
        reference=reference or payload.get("invoice_no") or payload.get("barcode"),
        actor_kind=resolved_actor.kind,
        actor_user_id=resolved_actor.user_id,
        actor_name=resolved_actor.name,
        actor_role=resolved_actor.role,
        payload=payload,
        barcode=payload.get("barcode"),
        invoice_no=payload.get("invoice_no"),
    )
    db.add(entry)
