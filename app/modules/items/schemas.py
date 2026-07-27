from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator


class ItemBase(BaseModel):
    sku: str = Field(min_length=1, max_length=50)
    barcode: str | None = Field(default=None, max_length=100)
    category: str = Field(default="jewellery", min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=255)
    metal: str = Field(min_length=1, max_length=50)
    purity: Decimal = Field(ge=0, le=100)
    net_weight: Decimal = Field(ge=0)
    making_charge: Decimal = Field(ge=0)
    quantity: int = Field(1, ge=0)
    notes: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="before")
    @classmethod
    def normalize_net_weight(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values

        values_by_field = dict(values)
        category = values_by_field.get("category")
        net_weight = values_by_field.get("net_weight")
        if category == "unique":
            values_by_field["net_weight"] = 0
        elif net_weight is not None and Decimal(str(net_weight)) == 0:
            raise ValueError("net_weight can only be 0 for unique items")
        return values_by_field

    @field_serializer("purity", "net_weight", "making_charge")
    def serialize_decimal(self, value: Decimal) -> float:
        return float(value)


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseModel):
    sku: str | None = Field(default=None, min_length=1, max_length=50)
    barcode: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, min_length=1, max_length=20)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    metal: str | None = Field(default=None, min_length=1, max_length=50)
    purity: Decimal | None = Field(None, ge=0, le=100)
    net_weight: Decimal | None = Field(None, ge=0)
    making_charge: Decimal | None = Field(None, ge=0)
    quantity: int | None = Field(None, ge=0)
    notes: str | None = Field(default=None, max_length=4000)


class ItemOut(ItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str


class ItemPaginationOut(BaseModel):
    items: list[ItemOut]
    total: int
    page: int
    limit: int
    pages: int


class PricingBreakdown(BaseModel):
    category: str
    rate_per_gram: float
    net_weight: float
    metal_value: float
    making_charge: float
    suggested_price: float


class ItemPOS(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sku: str
    barcode: str | None
    category: str
    name: str
    metal: str
    purity: float
    net_weight: float
    quantity: int
    status: str


class ItemPOSWithPrice(ItemPOS):
    pricing: PricingBreakdown
    tax_rate_percent: float
