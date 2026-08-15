from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import (
    RequireCashier,
    RequireManager,
    ShopContext,
    get_shop_context,
)
from app.modules.changelog.schemas import (
    AuditActorOption,
    AuditLogPage,
    SoldTransactionPage,
)
from app.modules.changelog.service import (
    get_audit_actor_options,
    get_audit_log_history,
    get_sold_transaction_history,
)

router = APIRouter(prefix="/change-log", tags=["Change Log"])


@router.get(
    "/sold",
    response_model=SoldTransactionPage,
    dependencies=[RequireCashier],
)
async def sold_transaction_history(
    search: str | None = Query(
        None,
        max_length=100,
        description="Filter today's sold items by item, SKU, barcode, or invoice number.",
    ),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
) -> SoldTransactionPage:
    return SoldTransactionPage.model_validate(
        await get_sold_transaction_history(
            db,
            shop_id=context.shop.id,
            search=search,
            page=page,
            limit=limit,
        )
    )


@router.get(
    "/actors",
    response_model=list[AuditActorOption],
    dependencies=[RequireManager],
)
async def audit_actor_options(
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
) -> list[AuditActorOption]:
    return [
        AuditActorOption.model_validate(actor)
        for actor in await get_audit_actor_options(db, shop_id=context.shop.id)
    ]


@router.get(
    "/history",
    response_model=AuditLogPage,
    dependencies=[RequireManager],
)
async def audit_log_history(
    search: str | None = Query(
        None,
        max_length=100,
        description="Filter by record label, barcode, SKU, or invoice number.",
    ),
    event_type: str | None = Query(
        None,
        max_length=60,
        description=(
            "Filter by an exact event type, or use team.ownership_transfer "
            "for requested and completed ownership transfers."
        ),
    ),
    actor_user_id: UUID | None = Query(None),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
) -> AuditLogPage:
    return AuditLogPage.model_validate(
        await get_audit_log_history(
            db,
            shop_id=context.shop.id,
            search=search,
            event_type=event_type,
            actor_user_id=actor_user_id,
            from_date=from_date,
            to_date=to_date,
            page=page,
            limit=limit,
        )
    )
