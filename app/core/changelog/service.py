from sqlalchemy.ext.asyncio import AsyncSession

from app.core.changelog.models import ChangeLog


async def log_change(
    db: AsyncSession,
    *,
    entity: str,
    entity_id,
    action: str,
    payload: dict,
):
    entry = ChangeLog(
        entity=entity,
        entity_id=entity_id,
        action=action,
        payload=payload,
    )
    db.add(entry)
