import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ALLOWED_INVITE_ROLES = frozenset({"ADMIN", "MANAGER", "CASHIER"})


class ShopResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str
    is_primary: bool
    access_mode: Literal["read_write", "read_only"]
    name: str
    slug: str
    role: str
    legal_name: str | None = None
    tax_id: str | None = None
    phone: str | None = None
    address: str | None = None
    state: str | None = None
    state_code: str | None = None
    invoice_prefix: str | None = None


class ShopUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    legal_name: str | None = Field(default=None, min_length=1, max_length=200)
    tax_id: str | None = Field(default=None, max_length=30)
    phone: str | None = Field(default=None, pattern=r"^[0-9]{10}$")
    address: str | None = Field(default=None, max_length=500)
    state: str | None = Field(default=None, min_length=1, max_length=100)
    state_code: str | None = Field(default=None, min_length=1, max_length=10)
    invoice_prefix: str | None = Field(default=None, min_length=1, max_length=20)

    @field_validator(
        "name",
        "legal_name",
        "tax_id",
        "address",
        "state",
        "state_code",
        "invoice_prefix",
    )
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_optional_phone(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("invoice_prefix")
    @classmethod
    def validate_invoice_prefix(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.upper()
        if not normalized.replace("-", "").isalnum():
            raise ValueError("Invoice prefix may contain only letters, numbers, and hyphens")
        return normalized


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


class PendingInvitationResponse(BaseModel):
    id: uuid.UUID
    shop_id: uuid.UUID
    email: str
    role: str
    expires_at: datetime
    created_at: datetime


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


class OwnershipTransfer(BaseModel):
    target_membership_id: uuid.UUID


class OwnershipTransferResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    target_user_id: uuid.UUID
    status: Literal["pending", "processing", "completed", "failed"]
    created_at: datetime
    completed_at: datetime | None = None


class MembershipResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
