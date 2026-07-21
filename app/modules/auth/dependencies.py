from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import Device, User
from app.modules.auth.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)], db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id_value = payload.get("sub")
        token_type = payload.get("type")
        if not isinstance(user_id_value, str) or token_type != "access":
            raise credentials_exception
        user_id = UUID(user_id_value)
    except (TypeError, ValueError) as exc:
        raise credentials_exception from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")
    return user


async def get_current_device(
    x_device_uuid: Annotated[str, Header()],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Device:
    result = await db.execute(
        select(Device).where(
            Device.device_uuid == x_device_uuid, Device.registered_by_user_id == current_user.id
        )
    )
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device not registered")
    if not device.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device is disabled")
    return device


class RoleChecker:
    def __init__(self, allowed_roles: frozenset[str]):
        self.allowed_roles = allowed_roles

    def __call__(
        self, user: User = Depends(get_current_user), device: Device = Depends(get_current_device)
    ):
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Operation not permitted"
            )
        return user


RequireAuth = Depends(RoleChecker(frozenset({"Admin", "Manager", "Cashier"})))
RequireAdmin = Depends(RoleChecker(frozenset({"Admin"})))
RequireManager = Depends(RoleChecker(frozenset({"Admin", "Manager"})))
RequireCashier = Depends(RoleChecker(frozenset({"Admin", "Manager", "Cashier"})))
