from uuid import UUID

from pydantic import BaseModel, Field


class SaleItemInput(BaseModel):
    item_id: UUID
    quantity: int = Field(1, ge=1)


class SaleCreate(BaseModel):
    invoice_no: str
    items: list[SaleItemInput]

    customer_name: str
    customer_phone: str
    customer_address: str | None = None
    total_amount: float | None = None


class SaleOut(BaseModel):
    id: UUID
    invoice_no: str
    total_amount: float
