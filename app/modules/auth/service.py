from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import Device, User
from app.modules.auth.schemas import LoginRequest, RefreshRequest, TokenResponse
from app.modules.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)


async def authenticate_user(db: AsyncSession, login_data: LoginRequest) -> TokenResponse:
    # Validate User
    result = await db.execute(select(User).where(User.username == login_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

    # Handle Device Registration
    device_result = await db.execute(
        select(Device).where(Device.device_uuid == login_data.device_uuid)
    )
    device = device_result.scalar_one_or_none()

    if device is None:
        device = Device(
            device_uuid=login_data.device_uuid,
            device_name=login_data.device_name,
            platform=login_data.platform,
            app_version=login_data.app_version,
            registered_by_user_id=user.id,
        )
        db.add(device)
        await db.flush()
        await db.refresh(device)
    else:
        if not device.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device is disabled")
        if device.registered_by_user_id != user.id:
            # Re-assign or block? Usually block or require re-auth. Let's just update the user.
            device.registered_by_user_id = user.id
            device.device_name = login_data.device_name
        # Update last seen
        device.last_seen = datetime.now(UTC)
        device.app_version = login_data.app_version
        await db.flush()

    # Generate tokens
    access_token = create_access_token(subject=user.id, role=user.role)
    refresh_token = create_refresh_token(subject=user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        role=user.role,
        full_name=user.full_name,
        user_id=user.id,
    )


async def refresh_access_token(db: AsyncSession, refresh_data: RefreshRequest) -> TokenResponse:
    try:
        payload = decode_token(refresh_data.refresh_token)
        user_id_value = payload.get("sub")
        token_type = payload.get("type")
        if not isinstance(user_id_value, str) or token_type != "refresh":
            raise ValueError()
        user_id = UUID(user_id_value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User not found or inactive"
        )

    access_token = create_access_token(subject=user.id, role=user.role)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_data.refresh_token,
        role=user.role,
        full_name=user.full_name,
        user_id=user.id,
    )
