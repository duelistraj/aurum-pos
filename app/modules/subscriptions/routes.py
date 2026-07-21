from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import RequireCashier, ShopContext, get_shop_context
from app.modules.subscriptions.schemas import EntitlementResponse
from app.modules.subscriptions.service import get_entitlement_response

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])


@router.get(
    "/entitlement",
    response_model=EntitlementResponse,
    dependencies=[RequireCashier],
)
async def entitlement(
    context: ShopContext = Depends(get_shop_context), db: AsyncSession = Depends(get_db)
):
    return await get_entitlement_response(db, context.shop.id)
