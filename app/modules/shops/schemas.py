import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

ALLOWED_INVITE_ROLES = frozenset({"ADMIN", "MANAGER", "CASHIER"})


class ShopResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    role: str


class ShopCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)


class InvitationCreate(BaseModel):
    email: str
    role: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().casefold()

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in ALLOWED_INVITE_ROLES:
            raise ValueError("Role must be ADMIN, MANAGER, or CASHIER")
        return normalized


class InvitationResponse(BaseModel):
    id: uuid.UUID
    shop_id: uuid.UUID
    email: str
    role: str
    expires_at: datetime
    created_at: datetime
    token: str | None = None


class MembershipUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.upper()
        if normalized not in ALLOWED_INVITE_ROLES:
            raise ValueError("Role must be ADMIN, MANAGER, or CASHIER")
        return normalized
