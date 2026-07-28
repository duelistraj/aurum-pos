import re
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class DeviceInfo(BaseModel):
    device_uuid: str = Field(min_length=8, max_length=100)
    device_name: str = Field(min_length=1, max_length=100)
    platform: str = Field(min_length=1, max_length=50)
    app_version: str = Field(min_length=1, max_length=20)


class EmailModel(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().casefold()
        if len(normalized) > 320 or not EMAIL_PATTERN.match(normalized):
            raise ValueError("Enter a valid email address")
        return normalized


class RegisterRequest(EmailModel, DeviceInfo):
    password: str = Field(min_length=12, max_length=256)
    full_name: str = Field(min_length=1, max_length=100)
    shop_name: str = Field(min_length=1, max_length=150)

    @field_validator("full_name", "shop_name")
    @classmethod
    def validate_nonblank_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        return normalized


class LoginRequest(EmailModel, DeviceInfo):
    password: str = Field(min_length=1, max_length=256)


class GoogleAuthRequest(DeviceInfo):
    id_token: str = Field(min_length=1, max_length=8192)
    nonce: str = Field(min_length=16, max_length=256)
    shop_name: str | None = Field(None, min_length=1, max_length=150)
    invitation_token: str | None = Field(default=None, max_length=256)

    @field_validator("shop_name")
    @classmethod
    def validate_optional_shop_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        return normalized


class GoogleAuthProviderResponse(BaseModel):
    enabled: bool
    client_id: str | None


class AuthProvidersResponse(BaseModel):
    google: GoogleAuthProviderResponse


class MembershipResponse(BaseModel):
    shop_id: uuid.UUID
    shop_name: str
    shop_slug: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    full_name: str
    user_id: uuid.UUID
    email: str
    memberships: list[MembershipResponse]


class RefreshRequest(BaseModel):
    refresh_token: str | None = Field(default=None, min_length=32, max_length=256)
    device_uuid: str = Field(min_length=8, max_length=100)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class VerificationResendRequest(EmailModel):
    pass


class ForgotPasswordRequest(EmailModel):
    pass


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    password: str = Field(min_length=12, max_length=256)


class AccountDeletionStart(EmailModel):
    delete_owned_shops: bool = False


class AccountDeletionConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class InvitationAcceptRequest(EmailModel, DeviceInfo):
    token: str = Field(min_length=32, max_length=256)
    password: str = Field(min_length=12, max_length=256)
    full_name: str = Field(min_length=1, max_length=100)


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    email_verified_at: datetime | None
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
    user_id: uuid.UUID

    model_config = {"from_attributes": True}


class DeviceUpdate(BaseModel):
    is_active: bool
