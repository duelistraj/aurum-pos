from typing import Annotated
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from uuid import UUID

from app.core.database import get_db
from app.modules.auth.models import User, Device
from app.modules.auth.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id_str: str = payload.get("sub")
        token_type: str = payload.get("type")
        if user_id_str is None or token_type != "access":
            raise credentials_exception
        user_id = UUID(user_id_str)
    except Exception:
        raise credentials_exception

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
    db: AsyncSession = Depends(get_db)
) -> Device:
    result = await db.execute(
        select(Device).where(
            Device.device_uuid == x_device_uuid,
            Device.registered_by_user_id == current_user.id
        )
    )
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device not registered")
    if not device.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device is disabled")
    return device


class RoleChecker:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_user), device: Device = Depends(get_current_device)):
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted"
            )
        return user


RequireAuth = Depends(RoleChecker(["Admin", "Manager", "Cashier"]))
RequireAdmin = Depends(RoleChecker(["Admin"]))
RequireManager = Depends(RoleChecker(["Admin", "Manager"]))
RequireCashier = Depends(RoleChecker(["Admin", "Manager", "Cashier"]))
