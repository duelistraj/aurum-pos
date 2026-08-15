from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

AuditActorKind = Literal["user", "system", "unknown"]
AuditDetailKind = Literal["changes", "facts", "sale"]


class AuditActorOut(BaseModel):
    kind: AuditActorKind
    user_id: UUID | None = None
    name: str
    role: str | None = None


class AuditSubjectOut(BaseModel):
    type: str
    id: UUID
    label: str
    reference: str | None = None


class AuditChangeOut(BaseModel):
    field: str
    label: str
    before: Any = None
    after: Any = None


class AuditFactOut(BaseModel):
    label: str
    value: Any = None


class AuditSaleItemOut(BaseModel):
    item_id: UUID
    name: str
    sku: str | None = None
    barcode: str | None = None
    quantity: int | None = None
    weight_grams: float | None = None
    amount: float


class AuditDetailsOut(BaseModel):
    kind: AuditDetailKind
    changes: list[AuditChangeOut] = Field(default_factory=list)
    facts: list[AuditFactOut] = Field(default_factory=list)
    sale_items: list[AuditSaleItemOut] = Field(default_factory=list)
    total: float | None = None


class AuditLogEntry(BaseModel):
    id: UUID
    event_type: str
    area: str
    subject: AuditSubjectOut
    actor: AuditActorOut
    summary: str
    details: AuditDetailsOut
    created_at: datetime


class AuditLogPage(BaseModel):
    entries: list[AuditLogEntry]
    total: int
    page: int
    limit: int
    pages: int


class AuditActorOption(BaseModel):
    user_id: UUID
    name: str
    role: str | None = None


class SoldTransactionEntry(BaseModel):
    id: UUID
    item_id: UUID
    item_name: str
    sku: str | None = None
    barcode: str | None = None
    invoice_no: str | None = None
    quantity: int | None = None
    weight_grams: float | None = None
    amount: float
    created_at: datetime


class SoldTransactionPage(BaseModel):
    entries: list[SoldTransactionEntry]
    total: int
    page: int
    limit: int
    pages: int


# Dashboard summaries still use this compact, presentation-neutral shape.
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
