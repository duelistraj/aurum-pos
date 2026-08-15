from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel


class ChangeLogEntry(BaseModel):
    id: UUID
    entity: str
    action: str
    payload: dict[str, Any]
    created_at: datetime


class ChangeLogPage(BaseModel):
    entries: list[ChangeLogEntry]
    total: int
    page: int
    limit: int
    pages: int


class SoldChangeLogPayload(BaseModel):
    barcode: str | None = None
    invoice_no: str | None = None
    quantity: int | None = None
    weight_grams: float | None = None
    pricing: dict[str, Any]


class SoldChangeLogEntry(BaseModel):
    id: UUID
    entity: Literal["item"]
    action: Literal["sold"]
    payload: SoldChangeLogPayload
    created_at: datetime


class SoldChangeLogPage(BaseModel):
    entries: list[SoldChangeLogEntry]
    total: int
    page: int
    limit: int
    pages: int
