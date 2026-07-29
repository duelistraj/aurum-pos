from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.auth.models import User
from app.modules.items.models import Item
from app.modules.shops.models import (
    Organization,
    Shop,
    ShopInvitation,
    ShopMembership,
)
from app.modules.subscriptions.models import Subscription
from app.modules.subscriptions.schemas import EntitlementResponse

ACTIVE_ITEM_STATUSES = frozenset({"in_stock", "reserved"})


@dataclass(frozen=True)
class Entitlement:
    plan: Literal["free", "pro"]
    source: str
    item_limit: int | None
    shop_limit: int | None
    team_seat_limit: int | None
    expires_at: datetime | None


async def resolve_entitlement(db: AsyncSession, organization_id: UUID) -> Entitlement:
    if not settings.is_hosted:
        return Entitlement(
            plan="pro",
            source="self_hosted",
            item_limit=None,
            shop_limit=None,
            team_seat_limit=None,
            expires_at=None,
        )
    await db.execute(
        text("SELECT set_config('app.current_organization_id', :organization_id, true)"),
        {"organization_id": str(organization_id)},
    )
    now = datetime.now(UTC)
    subscription = await db.scalar(
        select(Subscription)
        .where(
            Subscription.organization_id == organization_id,
            Subscription.plan == "pro",
            Subscription.status == "active",
            Subscription.revoked_at.is_(None),
            Subscription.starts_at <= now,
            or_(Subscription.expires_at.is_(None), Subscription.expires_at > now),
        )
        .order_by(Subscription.expires_at.desc().nulls_first(), Subscription.created_at.desc())
        .limit(1)
    )
    if subscription:
        return Entitlement(
            plan="pro",
            source=subscription.source,
            item_limit=None,
            shop_limit=settings.pro_shop_limit,
            team_seat_limit=settings.pro_team_seat_limit,
            expires_at=subscription.expires_at,
        )
    return Entitlement(
        plan="free",
        source="hosted_free",
        item_limit=settings.free_active_item_limit,
        shop_limit=settings.free_shop_limit,
        team_seat_limit=settings.free_team_seat_limit,
        expires_at=None,
    )


async def count_active_items(db: AsyncSession, shop_id: UUID) -> int:
    value = await db.scalar(
        select(func.count(Item.id)).where(
            Item.shop_id == shop_id,
            Item.status.in_(ACTIVE_ITEM_STATUSES),
            Item.quantity > 0,
        )
    )
    return int(value or 0)


async def count_organization_shops(db: AsyncSession, organization_id: UUID) -> int:
    value = await db.scalar(
        select(func.count(Shop.id)).where(
            Shop.organization_id == organization_id,
            Shop.is_active.is_(True),
        )
    )
    return int(value or 0)


async def organization_team_emails(
    db: AsyncSession,
    organization_id: UUID,
) -> set[str]:
    active_emails = await db.scalars(
        select(User.email)
        .join(ShopMembership, ShopMembership.user_id == User.id)
        .join(Shop, Shop.id == ShopMembership.shop_id)
        .where(
            Shop.organization_id == organization_id,
            Shop.is_active.is_(True),
            ShopMembership.is_active.is_(True),
            User.is_active.is_(True),
        )
        .distinct()
    )
    pending_emails = await db.scalars(
        select(ShopInvitation.email)
        .join(Shop, Shop.id == ShopInvitation.shop_id)
        .where(
            Shop.organization_id == organization_id,
            ShopInvitation.accepted_at.is_(None),
            ShopInvitation.expires_at > datetime.now(UTC),
        )
        .distinct()
    )
    return {email.strip().casefold() for email in (*active_emails.all(), *pending_emails.all())}


def shop_access_mode(
    *,
    entitlement: Entitlement,
    organization: Organization,
    shop: Shop,
) -> Literal["read_write", "read_only"]:
    if entitlement.plan == "pro" or organization.primary_shop_id == shop.id:
        return "read_write"
    return "read_only"


async def get_entitlement_response(
    db: AsyncSession,
    organization_id: UUID,
    shop_id: UUID,
) -> EntitlementResponse:
    organization = await db.get(Organization, organization_id)
    shop = await db.get(Shop, shop_id)
    if organization is None or shop is None or shop.organization_id != organization.id:
        raise HTTPException(status_code=404, detail="Organization or shop not found")
    entitlement = await resolve_entitlement(db, organization_id)
    item_count = await count_active_items(db, shop_id)
    shop_count = await count_organization_shops(db, organization_id)
    team_usage = len(await organization_team_emails(db, organization_id))
    access_mode = shop_access_mode(
        entitlement=entitlement,
        organization=organization,
        shop=shop,
    )
    return EntitlementResponse(
        organization_id=organization_id,
        plan=entitlement.plan,
        source=entitlement.source,
        active_item_limit=entitlement.item_limit,
        active_item_count=item_count,
        can_add_item=(
            access_mode == "read_write"
            and (entitlement.item_limit is None or item_count < entitlement.item_limit)
        ),
        shop_limit=entitlement.shop_limit,
        shop_count=shop_count,
        team_seat_limit=entitlement.team_seat_limit,
        team_seat_usage=team_usage,
        can_create_shop=(entitlement.shop_limit is None or shop_count < entitlement.shop_limit),
        can_invite_member=(
            entitlement.team_seat_limit is None or team_usage < entitlement.team_seat_limit
        ),
        access_mode=access_mode,
        expires_at=entitlement.expires_at,
    )


async def enforce_shop_write_access(db: AsyncSession, shop_id: UUID) -> None:
    shop = await db.scalar(select(Shop).where(Shop.id == shop_id))
    if shop is None or not shop.is_active:
        raise HTTPException(status_code=404, detail="Shop does not exist")
    organization = await db.get(Organization, shop.organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization does not exist")
    entitlement = await resolve_entitlement(db, organization.id)
    if (
        shop_access_mode(
            entitlement=entitlement,
            organization=organization,
            shop=shop,
        )
        == "read_only"
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "SHOP_READ_ONLY",
                "message": "Restore Pro to make this additional shop writable.",
            },
        )


async def enforce_item_activation_limit(db: AsyncSession, shop_id: UUID) -> None:
    shop = await db.scalar(select(Shop).where(Shop.id == shop_id).with_for_update())
    if shop is None or not shop.is_active:
        raise HTTPException(status_code=404, detail="Shop does not exist")
    await enforce_shop_write_access(db, shop_id)
    entitlement = await resolve_entitlement(db, shop.organization_id)
    if entitlement.item_limit is None:
        return
    active_count = await count_active_items(db, shop_id)
    if active_count >= entitlement.item_limit:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "ITEM_LIMIT_REACHED",
                "message": (
                    f"The hosted free tier allows {entitlement.item_limit} "
                    "active inventory records."
                ),
                "active_item_count": active_count,
                "active_item_limit": entitlement.item_limit,
            },
        )


async def enforce_shop_creation_limit(
    db: AsyncSession,
    organization_id: UUID,
) -> None:
    organization = await db.scalar(
        select(Organization).where(Organization.id == organization_id).with_for_update()
    )
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    entitlement = await resolve_entitlement(db, organization_id)
    count = await count_organization_shops(db, organization_id)
    if entitlement.shop_limit is not None and count >= entitlement.shop_limit:
        code = "PRO_REQUIRED" if entitlement.plan == "free" else "SHOP_LIMIT_REACHED"
        raise HTTPException(
            status_code=409,
            detail={
                "code": code,
                "message": (
                    "Aurum Cloud Pro is required to add another shop."
                    if entitlement.plan == "free"
                    else f"Pro supports up to {entitlement.shop_limit} shops."
                ),
                "shop_count": count,
                "shop_limit": entitlement.shop_limit,
            },
        )


async def enforce_team_seat_limit(
    db: AsyncSession,
    organization_id: UUID,
    *,
    candidate_email: str,
) -> None:
    organization = await db.scalar(
        select(Organization).where(Organization.id == organization_id).with_for_update()
    )
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    normalized_email = candidate_email.strip().casefold()
    team_emails = await organization_team_emails(db, organization_id)
    if normalized_email in team_emails:
        return
    entitlement = await resolve_entitlement(db, organization_id)
    if entitlement.team_seat_limit is not None and len(team_emails) >= entitlement.team_seat_limit:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "TEAM_LIMIT_REACHED",
                "message": (
                    f"This organization has used all {entitlement.team_seat_limit} "
                    "available team seats."
                ),
                "team_seat_usage": len(team_emails),
                "team_seat_limit": entitlement.team_seat_limit,
            },
        )
