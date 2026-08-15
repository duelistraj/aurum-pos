from datetime import datetime

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
    ChangeLogEntry,
    ChangeLogPage,
    SoldChangeLogPage,
)
from app.modules.changelog.service import get_change_log_history, get_sold_change_log_history

router = APIRouter(prefix="/change-log", tags=["Change Log"])


@router.get(
    "/sold",
    response_model=SoldChangeLogPage,
    dependencies=[RequireCashier],
)
async def sold_change_log_history(
    from_date: datetime | None = Query(
        None,
        alias="from_date",
        description="Filter sold entries created on or after this timestamp.",
    ),
    to_date: datetime | None = Query(
        None,
        alias="to_date",
        description="Filter sold entries created on or before this timestamp.",
    ),
    barcode: str | None = Query(
        None,
        max_length=100,
        description="Filter sold entries by barcode prefix.",
    ),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
) -> SoldChangeLogPage:
    return SoldChangeLogPage.model_validate(
        await get_sold_change_log_history(
            db,
            shop_id=context.shop.id,
            from_date=from_date,
            to_date=to_date,
            barcode=barcode,
            page=page,
            limit=limit,
        )
    )


@router.get(
    "/history",
    response_model=ChangeLogPage | list[ChangeLogEntry],
    dependencies=[RequireManager],
)
async def change_log_history(
    from_date: datetime | None = Query(
        None,
        alias="from_date",
        description="Filter entries created on or after this timestamp.",
    ),
    to_date: datetime | None = Query(
        None,
        alias="to_date",
        description="Filter entries created on or before this timestamp.",
    ),
    barcode: str | None = Query(
        None,
        max_length=100,
        description="Filter by barcode value found in the payload.",
    ),
    invoice_no: str | None = Query(
        None,
        max_length=50,
        description="Filter by invoice number found in the payload.",
    ),
    action: str | None = Query(
        None,
        max_length=20,
        description="Filter by action type.",
    ),
    page: int | None = Query(None, ge=1),
    limit: int | None = Query(None, ge=1, le=100),
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    result = await get_change_log_history(
        db,
        shop_id=context.shop.id,
        from_date=from_date,
        to_date=to_date,
        barcode=barcode,
        invoice_no=invoice_no,
        action=action,
        page=page or 1,
        limit=limit or 50,
    )
    if page is None and limit is None:
        return result["entries"]
    return result
