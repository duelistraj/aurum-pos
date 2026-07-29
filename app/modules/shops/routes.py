from datetime import UTC, datetime
from typing import Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth.dependencies import (
    RequireAdmin,
    RequireOwner,
    RequireWritableShop,
    ShopContext,
    get_current_user,
    get_shop_context,
)
from app.modules.auth.models import User
from app.modules.shops.models import (
    Organization,
    OrganizationOwnershipTransfer,
    Shop,
    ShopInvitation,
    ShopMembership,
)
from app.modules.shops.schemas import (
    InvitationCreate,
    InvitationResponse,
    MembershipResponse,
    MembershipUpdate,
    OwnershipTransfer,
    OwnershipTransferResponse,
    PendingInvitationResponse,
    ShopCreate,
    ShopResponse,
    ShopUpdate,
)
from app.modules.shops.service import create_invitation, create_shop, list_memberships
from app.modules.subscriptions.service import (
    enforce_shop_creation_limit,
    enforce_team_seat_limit,
    resolve_entitlement,
    shop_access_mode,
)

router = APIRouter(prefix="/shops", tags=["Shops"])
organizations_router = APIRouter(prefix="/organizations", tags=["Organizations"])


async def _shop_response(
    db: AsyncSession,
    *,
    membership: ShopMembership,
    shop: Shop,
) -> ShopResponse:
    organization = await db.get(Organization, shop.organization_id)
    if organization is None:
        raise HTTPException(status_code=500, detail="Shop organization is missing")
    await db.execute(
        text("SELECT set_config('app.current_organization_id', :organization_id, true)"),
        {"organization_id": str(organization.id)},
    )
    entitlement = await resolve_entitlement(db, organization.id)
    return ShopResponse(
        id=shop.id,
        organization_id=organization.id,
        organization_name=organization.name,
        is_primary=organization.primary_shop_id == shop.id,
        access_mode=shop_access_mode(
            entitlement=entitlement,
            organization=organization,
            shop=shop,
        ),
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


@router.get("", response_model=list[ShopResponse])
async def shops(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await list_memberships(db, user.id)
    return [
        await _shop_response(db, membership=membership, shop=shop)
        for membership, shop, _organization in rows
    ]


@organizations_router.post(
    "/{organization_id}/shops",
    response_model=ShopResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireOwner],
)
async def add_shop(
    organization_id: UUID,
    data: ShopCreate,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    if organization_id != context.organization.id:
        raise HTTPException(status_code=404, detail="Organization not found")
    if context.organization.owner_user_id != context.user.id:
        raise HTTPException(status_code=403, detail="Only the organization owner can add shops")
    await enforce_shop_creation_limit(db, organization_id)
    shop = await create_shop(
        db,
        name=data.name,
        owner_id=context.user.id,
        organization=context.organization,
    )
    await db.flush()
    membership = await db.scalar(
        select(ShopMembership).where(
            ShopMembership.shop_id == shop.id,
            ShopMembership.user_id == context.user.id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=500, detail="Shop owner membership was not created")
    return await _shop_response(db, membership=membership, shop=shop)


@router.patch(
    "/{shop_id}",
    response_model=ShopResponse,
    dependencies=[RequireAdmin, RequireWritableShop],
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
    return await _shop_response(
        db,
        membership=context.membership,
        shop=context.shop,
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
        if data.is_active and not membership.is_active:
            await enforce_team_seat_limit(
                db,
                context.organization.id,
                candidate_email=user.email,
            )
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
    response_model=OwnershipTransferResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[RequireOwner],
)
async def transfer_ownership_compatibility(
    shop_id: UUID,
    data: OwnershipTransfer,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    if shop_id != context.shop.id:
        raise HTTPException(status_code=404, detail="Shop not found")
    return await _request_ownership_transfer(
        db,
        context=context,
        organization_id=context.organization.id,
        data=data,
    )


@organizations_router.post(
    "/{organization_id}/ownership-transfers",
    response_model=OwnershipTransferResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[RequireOwner],
)
async def request_ownership_transfer(
    organization_id: UUID,
    data: OwnershipTransfer,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    return await _request_ownership_transfer(
        db,
        context=context,
        organization_id=organization_id,
        data=data,
    )


async def _request_ownership_transfer(
    db: AsyncSession,
    *,
    context: ShopContext,
    organization_id: UUID,
    data: OwnershipTransfer,
) -> OwnershipTransferResponse:
    organization = await db.scalar(
        select(Organization).where(Organization.id == organization_id).with_for_update()
    )
    if (
        organization is None
        or organization_id != context.organization.id
        or organization.owner_user_id != context.user.id
    ):
        raise HTTPException(status_code=404, detail="Organization not found")
    target_row = (
        await db.execute(
            select(ShopMembership, User)
            .join(User, User.id == ShopMembership.user_id)
            .where(
                ShopMembership.id == data.target_membership_id,
                ShopMembership.shop_id == context.shop.id,
            )
            .with_for_update()
        )
    ).one_or_none()
    if target_row is None:
        raise HTTPException(status_code=404, detail="Target staff membership not found")
    target, target_user = target_row
    if target.user_id == context.user.id or not target.is_active:
        raise HTTPException(status_code=409, detail="Select another active staff member")
    owned_organization = await db.scalar(
        select(Organization.id).where(
            Organization.owner_user_id == target.user_id,
            Organization.id != organization_id,
        )
    )
    if owned_organization is not None:
        raise HTTPException(
            status_code=409,
            detail="The target already owns another organization",
        )
    target_transfer = await db.scalar(
        select(OrganizationOwnershipTransfer.id).where(
            OrganizationOwnershipTransfer.target_user_id == target.user_id,
            OrganizationOwnershipTransfer.status.in_(("pending", "processing")),
        )
    )
    if target_transfer is not None:
        raise HTTPException(
            status_code=409,
            detail="The target already has an ownership transfer pending",
        )
    existing = await db.scalar(
        select(OrganizationOwnershipTransfer).where(
            OrganizationOwnershipTransfer.organization_id == organization_id,
            OrganizationOwnershipTransfer.status == "pending",
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Ownership transfer is already pending")
    transfer = OrganizationOwnershipTransfer(
        organization_id=organization_id,
        requested_by_user_id=context.user.id,
        target_user_id=target_user.id,
    )
    db.add(transfer)
    await db.flush()
    return OwnershipTransferResponse(
        id=transfer.id,
        organization_id=transfer.organization_id,
        target_user_id=transfer.target_user_id,
        status="pending",
        created_at=transfer.created_at,
        completed_at=None,
    )


@organizations_router.get(
    "/{organization_id}/ownership-transfers/current",
    response_model=OwnershipTransferResponse | None,
    dependencies=[RequireAdmin],
)
async def current_ownership_transfer(
    organization_id: UUID,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    if organization_id != context.organization.id:
        raise HTTPException(status_code=404, detail="Organization not found")
    transfer = await db.scalar(
        select(OrganizationOwnershipTransfer)
        .where(OrganizationOwnershipTransfer.organization_id == organization_id)
        .order_by(OrganizationOwnershipTransfer.created_at.desc())
        .limit(1)
    )
    if transfer is None:
        return None
    return OwnershipTransferResponse(
        id=transfer.id,
        organization_id=transfer.organization_id,
        target_user_id=transfer.target_user_id,
        status=cast(
            Literal["pending", "processing", "completed", "failed"],
            transfer.status,
        ),
        created_at=transfer.created_at,
        completed_at=transfer.completed_at,
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
    await enforce_team_seat_limit(
        db,
        context.organization.id,
        candidate_email=data.email,
    )
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


@router.get(
    "/{shop_id}/invitations",
    response_model=list[PendingInvitationResponse],
    dependencies=[RequireAdmin],
)
async def pending_invitations(
    shop_id: UUID,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    if shop_id != context.shop.id:
        raise HTTPException(status_code=404, detail="Shop not found")
    rows = await db.scalars(
        select(ShopInvitation)
        .where(
            ShopInvitation.shop_id == shop_id,
            ShopInvitation.accepted_at.is_(None),
            ShopInvitation.expires_at > datetime.now(UTC),
        )
        .order_by(ShopInvitation.created_at.desc())
    )
    return [
        PendingInvitationResponse(
            id=invitation.id,
            shop_id=invitation.shop_id,
            email=invitation.email,
            role=invitation.role,
            expires_at=invitation.expires_at,
            created_at=invitation.created_at,
        )
        for invitation in rows
    ]


@router.delete(
    "/{shop_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[RequireAdmin],
)
async def revoke_invitation(
    shop_id: UUID,
    invitation_id: UUID,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    if shop_id != context.shop.id:
        raise HTTPException(status_code=404, detail="Shop not found")
    invitation = await db.scalar(
        select(ShopInvitation)
        .where(
            ShopInvitation.id == invitation_id,
            ShopInvitation.shop_id == shop_id,
            ShopInvitation.accepted_at.is_(None),
        )
        .with_for_update()
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="Pending invitation not found")
    await db.delete(invitation)
