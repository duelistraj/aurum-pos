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
