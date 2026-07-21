from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.dashboard.schemas import AnalyticsDashboardResponse
from app.modules.dashboard.service import get_dashboard_analytics, get_dashboard_summary

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
):
    return await get_dashboard_summary(db)


@router.get("/analytics", response_model=AnalyticsDashboardResponse)
async def dashboard_analytics(
    from_date: datetime = Query(..., description="Start of date range (ISO)"),
    to_date: datetime = Query(..., description="End of date range (ISO)"),
    metal: str = Query("all", description="Metal type filter (all/gold/silver/platinum)"),
    db: AsyncSession = Depends(get_db),
):
    return await get_dashboard_analytics(db, from_date, to_date, metal)
