from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.shops.models import Organization, Shop, ShopMembership


async def create_test_shop(
    session: AsyncSession,
    *,
    name: str,
    slug: str,
    shop_id: UUID | None = None,
    owner_user_id: UUID | None = None,
) -> tuple[Organization, Shop, UUID]:
    resolved_shop_id = shop_id or uuid4()
    resolved_owner_id = owner_user_id or uuid4()
    if owner_user_id is None:
        session.add(
            User(
                id=resolved_owner_id,
                email=f"owner-{resolved_owner_id}@example.com",
                full_name="Test Shop Owner",
            )
        )
    organization = Organization(
        id=resolved_shop_id,
        name=name,
        owner_user_id=resolved_owner_id,
    )
    session.add(organization)
    await session.flush()
    shop = Shop(
        id=resolved_shop_id,
        organization_id=organization.id,
        name=name,
        slug=slug,
    )
    session.add(shop)
    await session.flush()
    organization.primary_shop_id = shop.id
    session.add(
        ShopMembership(
            shop_id=shop.id,
            user_id=resolved_owner_id,
            role="OWNER",
        )
    )
    return organization, shop, resolved_owner_id
