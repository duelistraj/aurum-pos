from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class SaleItemInput(BaseModel):
    item_id: UUID
    quantity: int | None = Field(default=None, ge=1)
    weight_grams: Decimal | None = Field(default=None, gt=0, decimal_places=3)

    @model_validator(mode="after")
    def validate_amount(self) -> "SaleItemInput":
        if self.quantity is not None and self.weight_grams is not None:
            raise ValueError("Provide either quantity or weight, not both")
        if self.quantity is None and self.weight_grams is None:
            self.quantity = 1
        return self


class SaleCreate(BaseModel):
    invoice_no: str | None = Field(default=None, max_length=50)
    items: list[SaleItemInput] = Field(min_length=1, max_length=100)

    customer_name: str = Field(min_length=1, max_length=100)
    customer_phone: str = Field(pattern=r"^[0-9]{10}$")
    customer_address: str | None = Field(default=None, max_length=255)
    total_amount: float | None = None
    send_invoice_via_whatsapp: bool = False


class SaleOut(BaseModel):
    id: UUID
    invoice_no: str
    total_amount: float
    whatsapp_delivery_status: str | None = None


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
    whatsapp_delivery_status: str | None = None
    whatsapp_consent_confirmed_at: datetime | None = None


class InvoicePageOut(BaseModel):
    invoices: list[InvoiceSummaryOut]
    total: int
    page: int
    limit: int
    pages: int
    next_cursor_created_at: datetime | None
    next_cursor_id: UUID | None
