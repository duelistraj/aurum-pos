from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import AuthSession, Device, User
from app.modules.auth.security import decode_token
from app.modules.shops.models import Shop, ShopDeviceAccess, ShopMembership

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


@dataclass(frozen=True)
class AuthContext:
    user: User
    session_id: UUID
    device_uuid: str


@dataclass(frozen=True)
class ShopContext:
    user: User
    shop: Shop
    membership: ShopMembership
    device: Device


async def get_auth_context(
    token: Annotated[str, Depends(oauth2_scheme)], db: AsyncSession = Depends(get_db)
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

    session = await db.scalar(
        select(AuthSession).where(
            AuthSession.id == session_id,
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > datetime.now(UTC),
        )
    )
    user = await db.get(User, user_id) if session else None
    if user is None or not user.is_active:
        raise credentials_exception
    assert session is not None
    return AuthContext(
        user=user,
        session_id=session_id,
        device_uuid=session.device_uuid,
    )


async def get_current_user(context: AuthContext = Depends(get_auth_context)) -> User:
    return context.user


async def get_current_device(
    x_device_uuid: Annotated[str, Header()],
    context: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Device:
    if x_device_uuid != context.device_uuid:
        raise HTTPException(
            status_code=403,
            detail="Device does not match the authenticated session",
        )
    device = await db.scalar(
        select(Device).where(
            Device.device_uuid == x_device_uuid,
            Device.user_id == context.user.id,
        )
    )
    if device is None or not device.is_active:
        raise HTTPException(status_code=403, detail="Device is not registered or is disabled")
    return device


async def get_shop_context(
    x_shop_id: Annotated[UUID, Header(alias="X-Shop-ID")],
    context: AuthContext = Depends(get_auth_context),
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ShopContext:
    await db.execute(
        text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
        {"shop_id": str(x_shop_id)},
    )
    await db.execute(
        text("SELECT set_config('app.current_user_id', :user_id, true)"),
        {"user_id": str(context.user.id)},
    )
    result = await db.execute(
        select(ShopMembership, Shop)
        .join(Shop, Shop.id == ShopMembership.shop_id)
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
    membership, shop = membership_row

    device_access = await db.scalar(
        select(ShopDeviceAccess).where(
            ShopDeviceAccess.shop_id == x_shop_id,
            ShopDeviceAccess.device_id == device.id,
        )
    )
    if device_access is None:
        device_access = ShopDeviceAccess(shop_id=x_shop_id, device_id=device.id)
        db.add(device_access)
        await db.flush()
    elif not device_access.is_active:
        raise HTTPException(status_code=403, detail="Device is disabled for this shop")
    return ShopContext(user=context.user, shop=shop, membership=membership, device=device)


class RoleChecker:
    def __init__(self, allowed_roles: frozenset[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, context: ShopContext = Depends(get_shop_context)) -> ShopContext:
        if context.membership.role not in self.allowed_roles:
            raise HTTPException(status_code=403, detail="Operation not permitted")
        return context


RequireAuth = Depends(get_shop_context)
RequireOwner = Depends(RoleChecker(frozenset({"OWNER"})))
RequireAdmin = Depends(RoleChecker(frozenset({"OWNER", "ADMIN"})))
RequireManager = Depends(RoleChecker(frozenset({"OWNER", "ADMIN", "MANAGER"})))
RequireCashier = Depends(RoleChecker(frozenset({"OWNER", "ADMIN", "MANAGER", "CASHIER"})))
