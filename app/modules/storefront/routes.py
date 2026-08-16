from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.modules.items.models import Item
from app.modules.storefront.schemas import (
    InventoryQuery,
    InventoryQueryOut,
    ReservationCreate,
    ReservationOut,
)
from app.modules.storefront.security import require_storefront_signature
from app.modules.storefront.service import (
    create_reservation,
    inventory_states,
    transition_reservation,
)

router = APIRouter(
    prefix="/storefront",
    tags=["Storefront integration"],
    dependencies=[Depends(require_storefront_signature)],
)


async def _bound_shop(db: AsyncSession) -> UUID:
    shop_id = settings.storefront_shop_id
    if shop_id is None:
        raise HTTPException(status_code=503, detail="Storefront shop is not configured")
    await db.execute(
        text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
        {"shop_id": str(shop_id)},
    )
    return shop_id


@router.post("/reservations", response_model=ReservationOut)
async def reserve(
    data: ReservationCreate,
    db: AsyncSession = Depends(get_db),
) -> ReservationOut:
    return await create_reservation(db, shop_id=await _bound_shop(db), data=data)


@router.post("/reservations/{reservation_id}/confirm", response_model=ReservationOut)
async def confirm(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ReservationOut:
    return await transition_reservation(
        db, shop_id=await _bound_shop(db), reservation_id=reservation_id, action="confirm"
    )


@router.post("/reservations/{reservation_id}/release", response_model=ReservationOut)
async def release(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ReservationOut:
    return await transition_reservation(
        db, shop_id=await _bound_shop(db), reservation_id=reservation_id, action="release"
    )


@router.post("/reservations/{reservation_id}/fulfill", response_model=ReservationOut)
async def fulfill(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ReservationOut:
    return await transition_reservation(
        db, shop_id=await _bound_shop(db), reservation_id=reservation_id, action="fulfill"
    )


@router.post("/inventory/query", response_model=InventoryQueryOut)
async def inventory(
    data: InventoryQuery,
    db: AsyncSession = Depends(get_db),
) -> InventoryQueryOut:
    shop_id = await _bound_shop(db)
    item_ids = list(dict.fromkeys(data.item_ids))
    items = list(
        await db.scalars(
            select(Item).where(
                Item.shop_id == shop_id,
                Item.id.in_(item_ids),
                Item.archived_at.is_(None),
            )
        )
    )
    return InventoryQueryOut(
        shop_id=shop_id,
        items=await inventory_states(db, shop_id=shop_id, items=items),
    )
