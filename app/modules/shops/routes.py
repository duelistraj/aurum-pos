from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth.dependencies import (
    RequireAdmin,
    RequireOwner,
    ShopContext,
    get_current_user,
    get_shop_context,
)
from app.modules.auth.models import User
from app.modules.shops.models import Shop, ShopMembership
from app.modules.shops.schemas import (
    InvitationCreate,
    InvitationResponse,
    MembershipResponse,
    MembershipUpdate,
    OwnershipTransfer,
    ShopResponse,
    ShopUpdate,
)
from app.modules.shops.service import create_invitation, list_memberships

router = APIRouter(prefix="/shops", tags=["Shops"])


@router.get("", response_model=list[ShopResponse])
async def shops(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await list_memberships(db, user.id)
    return [
        ShopResponse(
            id=shop.id,
            name=shop.name,
            slug=shop.slug,
            role=membership.role,
            legal_name=shop.legal_name,
            tax_id=shop.tax_id,
            phone=shop.phone,
            address=shop.address,
            state=shop.state,
            state_code=shop.state_code,
            invoice_prefix=shop.invoice_prefix,
            tax_rate_percent=shop.tax_rate_percent,
        )
        for membership, shop in rows
    ]


@router.patch(
    "/{shop_id}",
    response_model=ShopResponse,
    dependencies=[RequireAdmin],
)
async def update_shop(
    shop_id: UUID,
    data: ShopUpdate,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    if str(shop_id) != str(context.shop.id):
        raise HTTPException(status_code=404, detail="Shop not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(context.shop, field, value)
    await db.flush()
    return ShopResponse(
        id=context.shop.id,
        name=context.shop.name,
        slug=context.shop.slug,
        role=context.membership.role,
        legal_name=context.shop.legal_name,
        tax_id=context.shop.tax_id,
        phone=context.shop.phone,
        address=context.shop.address,
        state=context.shop.state,
        state_code=context.shop.state_code,
        invoice_prefix=context.shop.invoice_prefix,
        tax_rate_percent=context.shop.tax_rate_percent,
    )


@router.get(
    "/{shop_id}/members",
    response_model=list[MembershipResponse],
    dependencies=[RequireAdmin],
)
async def members(
    shop_id: UUID,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    if str(shop_id) != str(context.shop.id):
        raise HTTPException(status_code=404, detail="Shop not found")
    rows = await db.execute(
        select(ShopMembership, User)
        .join(User, User.id == ShopMembership.user_id)
        .where(ShopMembership.shop_id == context.shop.id)
        .order_by(ShopMembership.created_at, User.email)
    )
    return [
        MembershipResponse(
            id=membership.id,
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=membership.role,
            is_active=membership.is_active,
            created_at=membership.created_at,
        )
        for membership, user in rows
    ]


@router.patch(
    "/{shop_id}/members/{membership_id}",
    response_model=MembershipResponse,
    dependencies=[RequireAdmin],
)
async def update_member(
    shop_id: UUID,
    membership_id: UUID,
    data: MembershipUpdate,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    if str(shop_id) != str(context.shop.id):
        raise HTTPException(status_code=404, detail="Shop not found")
    row = (
        await db.execute(
            select(ShopMembership, User)
            .join(User, User.id == ShopMembership.user_id)
            .where(
                ShopMembership.id == membership_id,
                ShopMembership.shop_id == context.shop.id,
            )
            .with_for_update()
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Staff membership not found")
    membership, user = row
    if membership.role == "OWNER":
        raise HTTPException(
            status_code=409,
            detail="Transfer ownership before changing an owner membership",
        )
    if membership.user_id == context.user.id and data.is_active is False:
        raise HTTPException(status_code=409, detail="You cannot deactivate your own membership")
    if context.membership.role != "OWNER":
        if membership.role == "ADMIN" or data.role == "ADMIN":
            raise HTTPException(
                status_code=403,
                detail="Only owners can manage administrator memberships",
            )
    if data.role is not None:
        membership.role = data.role
    if data.is_active is not None:
        membership.is_active = data.is_active
    await db.flush()
    return MembershipResponse(
        id=membership.id,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=membership.role,
        is_active=membership.is_active,
        created_at=membership.created_at,
    )


@router.post(
    "/{shop_id}/ownership",
    response_model=MembershipResponse,
    dependencies=[RequireOwner],
)
async def transfer_ownership(
    shop_id: UUID,
    data: OwnershipTransfer,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    if shop_id != context.shop.id:
        raise HTTPException(status_code=404, detail="Shop not found")
    locked_shop = await db.scalar(select(Shop).where(Shop.id == context.shop.id).with_for_update())
    if locked_shop is None or not locked_shop.is_active:
        raise HTTPException(status_code=409, detail="Shop deletion is in progress")
    memberships = (
        await db.execute(
            select(ShopMembership, User)
            .join(User, User.id == ShopMembership.user_id)
            .where(
                ShopMembership.shop_id == context.shop.id,
                ShopMembership.id.in_((context.membership.id, data.target_membership_id)),
            )
            .with_for_update()
        )
    ).all()
    by_id = {membership.id: (membership, user) for membership, user in memberships}
    current_row = by_id.get(context.membership.id)
    target_row = by_id.get(data.target_membership_id)
    if current_row is None:
        raise HTTPException(status_code=409, detail="Current owner membership changed")
    if target_row is None:
        raise HTTPException(status_code=404, detail="Target staff membership not found")
    target, target_user = target_row
    if target.id == context.membership.id:
        raise HTTPException(status_code=409, detail="Select another active staff member")
    if not target.is_active:
        raise HTTPException(status_code=409, detail="Target staff membership is inactive")

    current_owner, _ = current_row
    if current_owner.role != "OWNER":
        raise HTTPException(status_code=409, detail="Current owner membership changed")
    target.role = "OWNER"
    current_owner.role = "ADMIN"
    await db.flush()
    return MembershipResponse(
        id=target.id,
        user_id=target_user.id,
        email=target_user.email,
        full_name=target_user.full_name,
        role=target.role,
        is_active=target.is_active,
        created_at=target.created_at,
    )


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
