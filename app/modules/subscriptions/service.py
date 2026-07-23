from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.items.models import Item
from app.modules.shops.models import Shop
from app.modules.subscriptions.models import Subscription
from app.modules.subscriptions.schemas import EntitlementResponse

ACTIVE_ITEM_STATUSES = frozenset({"in_stock", "reserved"})


@dataclass(frozen=True)
class Entitlement:
    plan: Literal["free", "pro"]
    source: str
    limit: int | None
    expires_at: datetime | None


async def resolve_entitlement(db: AsyncSession, shop_id: UUID) -> Entitlement:
    if not settings.is_hosted:
        return Entitlement(plan="pro", source="self_hosted", limit=None, expires_at=None)
    now = datetime.now(UTC)
    subscription = await db.scalar(
        select(Subscription)
        .where(
            Subscription.shop_id == shop_id,
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
            limit=None,
            expires_at=subscription.expires_at,
        )
    return Entitlement(
        plan="free",
        source="hosted_free",
        limit=settings.free_active_item_limit,
        expires_at=None,
    )


async def count_active_items(db: AsyncSession) -> int:
    value = await db.scalar(
        select(func.count(Item.id)).where(
            Item.status.in_(ACTIVE_ITEM_STATUSES),
            Item.quantity > 0,
        )
    )
    return int(value or 0)


async def get_entitlement_response(db: AsyncSession, shop_id: UUID) -> EntitlementResponse:
    entitlement = await resolve_entitlement(db, shop_id)
    count = await count_active_items(db)
    return EntitlementResponse(
        plan=entitlement.plan,
        source=entitlement.source,
        active_item_limit=entitlement.limit,
        active_item_count=count,
        can_add_item=entitlement.limit is None or count < entitlement.limit,
        expires_at=entitlement.expires_at,
    )


async def enforce_item_activation_limit(db: AsyncSession, shop_id: UUID) -> None:
    await db.scalar(select(Shop.id).where(Shop.id == shop_id).with_for_update())
    entitlement = await resolve_entitlement(db, shop_id)
    if entitlement.limit is None:
        return
    active_count = await count_active_items(db)
    if active_count >= entitlement.limit:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "ITEM_LIMIT_REACHED",
                "message": "The hosted free tier allows 50 active inventory records.",
                "active_item_count": active_count,
                "active_item_limit": entitlement.limit,
            },
        )
