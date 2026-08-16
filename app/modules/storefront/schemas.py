from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

ReservationStatus = Literal["held", "confirmed", "fulfilled", "released", "expired"]


class ReservationLineIn(BaseModel):
    item_id: UUID
    quantity: int = Field(ge=1, le=10_000)


class ReservationCreate(BaseModel):
    external_order_id: str = Field(min_length=1, max_length=100)
    expires_at: datetime
    lines: list[ReservationLineIn] = Field(min_length=1, max_length=100)

    @field_validator("expires_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("expires_at must include a timezone")
        return value


class InventoryStateOut(BaseModel):
    item_id: UUID
    on_hand_quantity: int
    reserved_quantity: int
    available_quantity: int
    status: str
    inventory_version: int


class ReservationOut(BaseModel):
    reservation_id: UUID
    external_order_id: str
    status: ReservationStatus
    expires_at: datetime | None
    items: list[InventoryStateOut]


class InventoryQuery(BaseModel):
    item_ids: list[UUID] = Field(min_length=1, max_length=500)


class InventoryQueryOut(BaseModel):
    shop_id: UUID
    items: list[InventoryStateOut]
