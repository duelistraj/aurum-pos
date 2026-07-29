from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class EntitlementResponse(BaseModel):
    organization_id: UUID
    plan: Literal["free", "pro"]
    source: str
    active_item_limit: int | None
    active_item_count: int
    can_add_item: bool
    shop_limit: int | None
    shop_count: int
    team_seat_limit: int | None
    team_seat_usage: int
    can_create_shop: bool
    can_invite_member: bool
    access_mode: Literal["read_write", "read_only"]
    expires_at: datetime | None


class PlayPurchaseRequest(BaseModel):
    purchase_token: str = Field(min_length=10)
    product_id: str = Field(min_length=1)


class PlayPurchaseResponse(BaseModel):
    entitlement: EntitlementResponse
    subscription_state: str
