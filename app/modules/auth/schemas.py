from pydantic import BaseModel, Field
import uuid
from typing import Optional
from datetime import datetime

class LoginRequest(BaseModel):
    username: str
    password: str
    device_uuid: str
    device_name: str
    platform: str
    app_version: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    full_name: str
    user_id: uuid.UUID

class RefreshRequest(BaseModel):
    refresh_token: str

class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class DeviceResponse(BaseModel):
    id: uuid.UUID
    device_uuid: str
    device_name: str
    platform: str
    app_version: str
    is_active: bool
    registered_at: datetime
    last_seen: datetime
    registered_by_user_id: uuid.UUID

    model_config = {"from_attributes": True}

class DeviceUpdate(BaseModel):
    is_active: bool


class VerifyManagerPasswordRequest(BaseModel):
    password: str

