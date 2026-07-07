from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.sales.schemas import SaleCreate, SaleOut
from app.modules.sales.service import create_sale

router = APIRouter(prefix="/sales", tags=["Sales"])


@router.post("/", response_model=SaleOut)
async def create(
    data: SaleCreate,
    db: AsyncSession = Depends(get_db),
):
    return await create_sale(db, data)
