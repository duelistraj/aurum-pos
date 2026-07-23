from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth.dependencies import (
    RequireAdmin,
    ShopContext,
    get_current_user,
    get_shop_context,
)
from app.modules.auth.models import User
from app.modules.shops.models import ShopMembership
from app.modules.shops.schemas import InvitationCreate, InvitationResponse, ShopResponse
from app.modules.shops.service import create_invitation, list_memberships

router = APIRouter(prefix="/shops", tags=["Shops"])


@router.get("", response_model=list[ShopResponse])
async def shops(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await list_memberships(db, user.id)
    return [
        ShopResponse(id=shop.id, name=shop.name, slug=shop.slug, role=membership.role)
        for membership, shop in rows
    ]


@router.post(
    "/{shop_id}/invitations",
    response_model=InvitationResponse,
    dependencies=[RequireAdmin],
)
async def invite(
    shop_id,
    data: InvitationCreate,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    if str(shop_id) != str(context.shop.id):
        raise HTTPException(status_code=404, detail="Shop not found")
    if data.role == "ADMIN" and context.membership.role != "OWNER":
        raise HTTPException(status_code=403, detail="Only owners can invite administrators")
    if await db.scalar(
        select(ShopMembership.id)
        .join(User, User.id == ShopMembership.user_id)
        .where(ShopMembership.shop_id == context.shop.id, User.email == data.email)
    ):
        raise HTTPException(status_code=409, detail="User is already a shop member")
    invitation, raw_token = await create_invitation(
        db,
        shop=context.shop,
        email=data.email,
        role=data.role,
        inviter=context.user,
    )
    return InvitationResponse(
        id=invitation.id,
        shop_id=invitation.shop_id,
        email=invitation.email,
        role=invitation.role,
        expires_at=invitation.expires_at,
        created_at=invitation.created_at,
        token=raw_token if settings.exposes_auth_tokens else None,
    )
