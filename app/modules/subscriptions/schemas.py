from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class EntitlementResponse(BaseModel):
    plan: Literal["free", "pro"]
    source: str
    active_item_limit: int | None
    active_item_count: int
    can_add_item: bool
    expires_at: datetime | None


class PlayPurchaseRequest(BaseModel):
    purchase_token: str = Field(min_length=10)
    product_id: str = Field(min_length=1)


class PlayPurchaseResponse(BaseModel):
    entitlement: EntitlementResponse
    subscription_state: str
