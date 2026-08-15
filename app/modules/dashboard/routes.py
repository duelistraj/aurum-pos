from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import (
    RequireCashier,
    RequireManager,
    ShopContext,
    get_shop_context,
)
from app.modules.dashboard.schemas import (
    AnalyticsDashboardResponse,
    CashierAnalyticsResponse,
    CashierDashboardSummary,
)
from app.modules.dashboard.service import (
    get_cashier_analytics,
    get_cashier_dashboard_summary,
    get_dashboard_analytics,
    get_dashboard_summary,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get(
    "/cashier/summary",
    response_model=CashierDashboardSummary,
    dependencies=[RequireCashier],
)
async def cashier_dashboard_summary(
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    return await get_cashier_dashboard_summary(db, shop_id=context.shop.id)


@router.get(
    "/cashier/analytics",
    response_model=CashierAnalyticsResponse,
    dependencies=[RequireCashier],
)
async def cashier_dashboard_analytics(
    metal: str = Query("all", description="Sales filter (all/gold/silver/platinum/stone)"),
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    normalized_metal = metal.strip().lower()
    if normalized_metal not in {"all", "gold", "silver", "platinum", "stone"}:
        raise HTTPException(status_code=422, detail="Unsupported metal filter")
    return await get_cashier_analytics(db, shop_id=context.shop.id, metal=normalized_metal)


@router.get("/summary", dependencies=[RequireManager])
async def dashboard_summary(
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    return await get_dashboard_summary(db, shop_id=context.shop.id)


@router.get(
    "/analytics",
    response_model=AnalyticsDashboardResponse,
    dependencies=[RequireManager],
)
async def dashboard_analytics(
    from_date: datetime = Query(..., description="Start of date range (ISO)"),
    to_date: datetime = Query(..., description="End of date range (ISO)"),
    metal: str = Query("all", description="Inventory filter (all/gold/silver/platinum/stone)"),
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    if from_date > to_date:
        raise HTTPException(status_code=422, detail="from_date must not be after to_date")
    if to_date - from_date > timedelta(days=366):
        raise HTTPException(status_code=422, detail="Analytics date range cannot exceed 366 days")
    normalized_metal = metal.strip().lower()
    if normalized_metal not in {"all", "gold", "silver", "platinum", "stone"}:
        raise HTTPException(status_code=422, detail="Unsupported metal filter")
    return await get_dashboard_analytics(
        db,
        from_date,
        to_date,
        normalized_metal,
        shop_id=context.shop.id,
    )
