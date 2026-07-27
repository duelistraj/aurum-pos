import re
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.auth.models import User
from app.modules.auth.security import hash_token
from app.modules.notifications.service import queue_email
from app.modules.shops.models import Shop, ShopInvitation, ShopMembership


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return slug[:80] or "shop"


async def create_shop(db: AsyncSession, *, name: str, owner_id) -> Shop:
    base_slug = slugify(name)
    slug = f"{base_slug[:80]}-{str(owner_id).replace('-', '')[:8]}"
    shop = Shop(name=name.strip(), slug=slug)
    db.add(shop)
    await db.flush()
    db.add(ShopMembership(shop_id=shop.id, user_id=owner_id, role="OWNER"))
    return shop


async def list_memberships(db: AsyncSession, user_id) -> list[tuple[ShopMembership, Shop]]:
    result = await db.execute(
        select(ShopMembership, Shop)
        .join(Shop, Shop.id == ShopMembership.shop_id)
        .where(
            ShopMembership.user_id == user_id,
            ShopMembership.is_active.is_(True),
            Shop.is_active.is_(True),
        )
        .order_by(Shop.name)
    )
    return [(row[0], row[1]) for row in result.all()]


async def create_invitation(
    db: AsyncSession,
    *,
    shop: Shop,
    email: str,
    role: str,
    inviter: User,
) -> tuple[ShopInvitation, str]:
    token = secrets.token_urlsafe(48)
    invitation = ShopInvitation(
        shop_id=shop.id,
        email=email,
        role=role,
        token_hash=hash_token(token),
        invited_by_user_id=inviter.id,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(invitation)
    queue_email(
        db,
        recipient=email,
        subject=f"You are invited to {shop.name} on Aurum POS",
        text_body=(
            f"Open Aurum POS, choose 'Accept a staff invitation', and enter this code:\n\n"
            f"{token}\n\nInstructions: {settings.public_site_url}/accept-invitation.html"
        ),
        template_data={"shop_name": shop.name, "role": role},
    )
    await db.flush()
    return invitation, token
