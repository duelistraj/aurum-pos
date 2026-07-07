from uuid import UUID
from pydantic import BaseModel, Field, model_validator


class ItemBase(BaseModel):
    sku: str
    barcode: str | None = None
    category: str = "jewellery"
    name: str
    metal: str
    purity: float = Field(ge=0, le=100)
    net_weight: float = Field(ge=0)
    making_charge: float = Field(ge=0)
    quantity: int = Field(1, ge=0)
    notes: str | None = None

    @model_validator(mode="before")
    def normalize_net_weight(cls, values):
        if isinstance(values, dict):
            category = values.get("category")
            net_weight = values.get("net_weight")

            if category == "unique":
                values["net_weight"] = 0
                return values

            if net_weight == 0:
                raise ValueError("net_weight can only be 0 for unique items")

        return values


class ItemCreate(ItemBase):
    pass


class ItemUpdate(ItemBase):
    pass


class ItemOut(ItemBase):
    id: UUID
    barcode: str | None = None
    status: str

    class Config:
        from_attributes = True


class ItemPaginationOut(BaseModel):
    items: list[ItemOut]
    total: int
    page: int
    limit: int
    pages: int


class ItemPOS(BaseModel):
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

    class Config:
        from_attributes = True

class ItemPOSWithPrice(ItemPOS):
    pricing: dict
