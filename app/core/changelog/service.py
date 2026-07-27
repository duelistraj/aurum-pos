from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.changelog.models import ChangeLog


async def log_change(
    db: AsyncSession,
    *,
    shop_id: UUID,
    entity: str,
    entity_id,
    action: str,
    payload: dict,
):
    entry = ChangeLog(
        shop_id=shop_id,
        entity=entity,
        entity_id=entity_id,
        action=action,
        payload=payload,
        barcode=payload.get("barcode"),
        invoice_no=payload.get("invoice_no"),
    )
    db.add(entry)
