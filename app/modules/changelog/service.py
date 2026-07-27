from datetime import datetime
from uuid import UUID

from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.changelog.models import ChangeLog


async def get_change_log_history(
    db: AsyncSession,
    *,
    shop_id: UUID,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    barcode: str | None = None,
    invoice_no: str | None = None,
    action: str | None = None,
    page: int = 1,
    limit: int = 50,
):
    stmt = select(ChangeLog).where(ChangeLog.shop_id == shop_id)
    filters = []

    if from_date is not None:
        filters.append(ChangeLog.created_at >= from_date)
    if to_date is not None:
        filters.append(ChangeLog.created_at <= to_date)
    if action:
        filters.append(ChangeLog.action == action)
    if barcode:
        filters.append(cast(ChangeLog.payload["barcode"], String).ilike(f"%{barcode}%"))
    if invoice_no:
        filters.append(cast(ChangeLog.payload["invoice_no"], String).ilike(f"%{invoice_no}%"))

    if filters:
        stmt = stmt.where(*filters)

    count_statement = select(func.count()).select_from(stmt.subquery())
    total = int((await db.execute(count_statement)).scalar_one() or 0)
    stmt = stmt.order_by(ChangeLog.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    return {
        "entries": [
            {
                "id": row.id,
                "entity": row.entity,
                "action": row.action,
                "payload": row.payload,
                "created_at": row.created_at,
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }
