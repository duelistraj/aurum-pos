from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import AuthSession, Device, User
from app.modules.auth.security import decode_token
from app.modules.shops.models import Organization, Shop, ShopDeviceAccess, ShopMembership
from app.modules.subscriptions.service import enforce_shop_write_access

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


@dataclass(frozen=True)
class AuthContext:
    user: User
    device: Device
    session_id: UUID
    device_uuid: str


@dataclass(frozen=True)
class ShopContext:
    user: User
    organization: Organization
    shop: Shop
    membership: ShopMembership
    device: Device


async def get_auth_context(
    token: Annotated[str, Depends(oauth2_scheme)],
    x_device_uuid: Annotated[str, Header()],
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id_value = payload.get("sub")
        session_id_value = payload.get("sid")
        if (
            not isinstance(user_id_value, str)
            or not isinstance(session_id_value, str)
            or payload.get("type") != "access"
        ):
            raise credentials_exception
        user_id = UUID(user_id_value)
        session_id = UUID(session_id_value)
    except (TypeError, ValueError) as exc:
        raise credentials_exception from exc

    auth_row = (
        await db.execute(
            select(AuthSession, User, Device)
            .join(User, User.id == AuthSession.user_id)
            .outerjoin(
                Device,
                (Device.user_id == AuthSession.user_id)
                & (Device.device_uuid == AuthSession.device_uuid),
            )
            .where(
                AuthSession.id == session_id,
                AuthSession.user_id == user_id,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > datetime.now(UTC),
                User.is_active.is_(True),
            )
        )
    ).one_or_none()
    if auth_row is None:
        raise credentials_exception
    session, user, device = auth_row
    if x_device_uuid != session.device_uuid:
        raise HTTPException(
            status_code=403,
            detail="Device does not match the authenticated session",
        )
    if device is None or not device.is_active:
        raise HTTPException(status_code=403, detail="Device is not registered or is disabled")
    return AuthContext(
        user=user,
        device=device,
        session_id=session_id,
        device_uuid=session.device_uuid,
    )


async def get_current_user(context: AuthContext = Depends(get_auth_context)) -> User:
    return context.user


async def get_current_device(
    context: AuthContext = Depends(get_auth_context),
) -> Device:
    return context.device


async def get_shop_context(
    x_shop_id: Annotated[UUID, Header(alias="X-Shop-ID")],
    context: AuthContext = Depends(get_auth_context),
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ShopContext:
    await db.execute(
        text(
            """
            SELECT set_config('app.current_shop_id', :shop_id, true),
                   set_config('app.current_user_id', :user_id, true)
            """
        ),
        {"shop_id": str(x_shop_id), "user_id": str(context.user.id)},
    )
    result = await db.execute(
        select(ShopMembership, Shop, Organization, ShopDeviceAccess)
        .join(Shop, Shop.id == ShopMembership.shop_id)
        .join(Organization, Organization.id == Shop.organization_id)
        .outerjoin(
            ShopDeviceAccess,
            (ShopDeviceAccess.shop_id == ShopMembership.shop_id)
            & (ShopDeviceAccess.device_id == device.id),
        )
        .where(
            ShopMembership.shop_id == x_shop_id,
            ShopMembership.user_id == context.user.id,
            ShopMembership.is_active.is_(True),
            Shop.is_active.is_(True),
        )
    )
    membership_row = result.one_or_none()
    if membership_row is None:
        raise HTTPException(status_code=404, detail="Shop membership not found")
    membership, shop, organization, device_access = membership_row
    await db.execute(
        text("SELECT set_config('app.current_organization_id', :organization_id, true)"),
        {"organization_id": str(organization.id)},
    )
    if device_access is None:
        await db.execute(
            pg_insert(ShopDeviceAccess)
            .values(shop_id=x_shop_id, device_id=device.id)
            .on_conflict_do_nothing(index_elements=("shop_id", "device_id"))
        )
        device_access = await db.scalar(
            select(ShopDeviceAccess).where(
                ShopDeviceAccess.shop_id == x_shop_id,
                ShopDeviceAccess.device_id == device.id,
            )
        )
    if device_access is None or not device_access.is_active:
        raise HTTPException(status_code=403, detail="Device is disabled for this shop")
    return ShopContext(
        user=context.user,
        organization=organization,
        shop=shop,
        membership=membership,
        device=device,
    )


class RoleChecker:
    def __init__(self, allowed_roles: frozenset[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, context: ShopContext = Depends(get_shop_context)) -> ShopContext:
        if context.membership.role not in self.allowed_roles:
            raise HTTPException(status_code=403, detail="Operation not permitted")
        return context


async def require_writable_shop(
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
) -> ShopContext:
    await enforce_shop_write_access(db, context.shop.id)
    return context


RequireAuth = Depends(get_shop_context)
RequireWritableShop = Depends(require_writable_shop)
RequireOwner = Depends(RoleChecker(frozenset({"OWNER"})))
RequireAdmin = Depends(RoleChecker(frozenset({"OWNER", "ADMIN"})))
RequireManager = Depends(RoleChecker(frozenset({"OWNER", "ADMIN", "MANAGER"})))
RequireCashier = Depends(RoleChecker(frozenset({"OWNER", "ADMIN", "MANAGER", "CASHIER"})))
