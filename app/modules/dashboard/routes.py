from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import ShopContext, get_shop_context
from app.modules.dashboard.schemas import AnalyticsDashboardResponse
from app.modules.dashboard.service import get_dashboard_analytics, get_dashboard_summary

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
async def dashboard_summary(
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    return await get_dashboard_summary(db, shop_id=context.shop.id)


@router.get("/analytics", response_model=AnalyticsDashboardResponse)
async def dashboard_analytics(
    from_date: datetime = Query(..., description="Start of date range (ISO)"),
    to_date: datetime = Query(..., description="End of date range (ISO)"),
    metal: str = Query("all", description="Metal type filter (all/gold/silver/platinum)"),
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    return await get_dashboard_analytics(
        db,
        from_date,
        to_date,
        metal,
        shop_id=context.shop.id,
    )
