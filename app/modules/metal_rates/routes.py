from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.metal_rates.schemas import MetalRateCreate
from app.modules.metal_rates.service import (
    add_metal_rate,
    get_all_metal_rates,
    get_available_metals,
)

router = APIRouter(prefix="/metal-rates", tags=["Metal Rates"])


@router.get("")
async def list_rates(
    db: AsyncSession = Depends(get_db),
):
    """Get all metal rates"""
    return await get_all_metal_rates(db)


@router.get("/available")
async def get_metals(
    db: AsyncSession = Depends(get_db),
):
    """Get all available metals and their purities"""
    metals = await get_available_metals(db)
    return metals


@router.post("/")
async def create_rate(
    data: MetalRateCreate,
    db: AsyncSession = Depends(get_db),
):
    return await add_metal_rate(db, data)
