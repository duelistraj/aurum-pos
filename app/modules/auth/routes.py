from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.core.config import settings
from app.modules.auth.schemas import LoginRequest, TokenResponse, RefreshRequest, DeviceResponse, DeviceUpdate, VerifyManagerPasswordRequest
from app.modules.auth.service import authenticate_user, refresh_access_token
from app.modules.auth.dependencies import RequireAdmin
from app.modules.auth.models import Device

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/login", response_model=TokenResponse)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user and register/verify device."""
    # rate-limiting could be added here later using slowapi
    return await authenticate_user(db, login_data)

@router.post("/refresh", response_model=TokenResponse)
async def refresh(refresh_data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Refresh access token using refresh token."""
    return await refresh_access_token(db, refresh_data)

@router.post("/logout")
async def logout():
    """Logout endpoint. In a stateless JWT system, the client deletes the token. 
    If we had a token blocklist, we would add the token here."""
    return {"message": "Successfully logged out"}

@router.get("/devices", response_model=List[DeviceResponse], dependencies=[RequireAdmin])
async def list_devices(db: AsyncSession = Depends(get_db)):
    """Admin endpoint to list all registered devices."""
    result = await db.execute(select(Device).order_by(Device.last_seen.desc()))
    return result.scalars().all()

@router.patch("/devices/{device_id}", response_model=DeviceResponse, dependencies=[RequireAdmin])
async def update_device_status(device_id: UUID, update_data: DeviceUpdate, db: AsyncSession = Depends(get_db)):
    """Admin endpoint to enable or disable a device."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    device.is_active = update_data.is_active
    await db.commit()
    await db.refresh(device)
    return device


@router.post("/verify-manager-password")
async def verify_manager_password(request_data: VerifyManagerPasswordRequest):
    """Verify if the provided password matches the manager password."""
    is_valid = request_data.password.strip() == settings.manager_password.strip()
    return {"valid": is_valid}
