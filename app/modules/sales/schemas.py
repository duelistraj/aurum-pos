from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class SaleItemInput(BaseModel):
    item_id: UUID
    quantity: int = Field(1, ge=1)


class SaleCreate(BaseModel):
    invoice_no: str | None = Field(default=None, max_length=50)
    items: list[SaleItemInput] = Field(min_length=1, max_length=100)

    customer_name: str = Field(min_length=1, max_length=100)
    customer_phone: str = Field(min_length=5, max_length=15)
    customer_address: str | None = Field(default=None, max_length=255)
    total_amount: float | None = None


class SaleOut(BaseModel):
    id: UUID
    invoice_no: str
    total_amount: float


class InvoiceDownloadOut(BaseModel):
    url: str
    expires_in_seconds: int


class InvoicePendingOut(BaseModel):
    status: str = "pending"
    retry_after_seconds: int = 2


InvoicePdfStatus = Literal["pending", "processing", "ready", "failed"]


class InvoiceSummaryOut(BaseModel):
    sale_id: UUID
    invoice_no: str
    created_at: datetime
    customer_name: str
    customer_phone: str
    total_amount: float
    pdf_status: InvoicePdfStatus
    pdf_generated_at: datetime | None


class InvoicePageOut(BaseModel):
    invoices: list[InvoiceSummaryOut]
    total: int
    page: int
    limit: int
    pages: int
    next_cursor_created_at: datetime | None
    next_cursor_id: UUID | None
