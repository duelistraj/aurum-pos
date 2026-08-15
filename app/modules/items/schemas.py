from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_serializer,
    field_validator,
    model_validator,
)

from app.modules.items.catalog import normalize_category
from app.modules.items.pricing import legacy_pricing_method
from app.modules.items.tax import get_tax_profile

ItemType = Literal["jewellery", "stone"]
PricingMethod = Literal[
    "fixed_rate", "fixed_making_charge", "making_charge_per_gram", "rate_per_ratti"
]
StockMode = Literal["quantity", "weight"]


class ItemBase(BaseModel):
    sku: str = Field(min_length=1, max_length=50)
    barcode: str | None = Field(default=None, max_length=100)
    category: str = Field(default="jewellery", min_length=1, max_length=20)
    item_type: ItemType = "jewellery"
    pricing_method: PricingMethod | None = None
    stock_mode: StockMode = "quantity"
    name: str = Field(min_length=1, max_length=255)
    metal: str = Field(default="gold", min_length=1, max_length=50)
    purity: Decimal = Field(default=Decimal(0), ge=0, le=100)
    net_weight: Decimal = Field(default=Decimal(0), ge=0)
    making_charge: Decimal = Field(default=Decimal(0), ge=0)
    fixed_rate: Decimal = Field(default=Decimal(0), ge=0)
    stock_weight: Decimal | None = Field(default=None, ge=0)
    ratti: Decimal | None = Field(default=None, gt=0)
    rate_per_ratti: Decimal | None = Field(default=None, gt=0)
    quantity: int = Field(1, ge=0)
    notes: str | None = Field(default=None, max_length=50)

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_payload(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values
        normalized = dict(values)
        normalized["category"] = normalize_category(str(normalized.get("category", "jewellery")))
        item_type = str(normalized.get("item_type", "jewellery")).strip().lower()
        normalized["item_type"] = item_type
        is_legacy_pricing = not normalized.get("pricing_method")
        if is_legacy_pricing:
            normalized["pricing_method"] = (
                "rate_per_ratti"
                if item_type == "stone"
                else legacy_pricing_method(normalized["category"])
            )
        normalized.setdefault("stock_mode", "quantity")
        if item_type == "stone":
            normalized.update(
                metal="stone",
                purity=0,
                net_weight=0,
                making_charge=0,
                fixed_rate=0,
                stock_weight=None,
            )
        elif normalized["pricing_method"] == "fixed_rate":
            legacy_making = Decimal(str(normalized.get("making_charge", 0) or 0))
            if normalized.get("fixed_rate") in (None, "") and legacy_making > 0:
                normalized["fixed_rate"] = legacy_making
            normalized["making_charge"] = 0
            normalized["stock_weight"] = None
            if is_legacy_pricing and normalized["category"] == "unique":
                normalized["net_weight"] = 0
        else:
            normalized["fixed_rate"] = 0
        if normalized["stock_mode"] == "weight":
            total_weight = Decimal(str(normalized.get("net_weight", 0) or 0))
            remaining_value = normalized.get("stock_weight")
            remaining_weight = Decimal(str(remaining_value or 0))
            if total_weight <= 0 and remaining_weight > 0:
                total_weight = remaining_weight
            if remaining_value is None:
                remaining_weight = total_weight
            normalized["net_weight"] = total_weight
            normalized["stock_weight"] = remaining_weight
            normalized["quantity"] = 1 if remaining_weight > 0 else 0
        else:
            normalized["stock_weight"] = None
        return normalized

    @model_validator(mode="after")
    def validate_modes(self) -> "ItemBase":
        if self.item_type == "stone":
            if self.pricing_method != "rate_per_ratti" or self.stock_mode != "quantity":
                raise ValueError("Stones must use rate per Ratti and quantity stock")
            if self.ratti is None or self.rate_per_ratti is None:
                raise ValueError("Ratti and rate per Ratti are required for stones")
            get_tax_profile(
                metal="stone",
                category=self.category,
                item_type="stone",
            )
            return self
        if self.pricing_method == "rate_per_ratti":
            raise ValueError("Rate per Ratti is only available for stones")
        if self.metal.strip().lower() == "stone":
            raise ValueError("Stone metal is only available for stone items")
        if self.ratti is not None or self.rate_per_ratti is not None:
            raise ValueError("Ratti pricing is only available for stones")
        if self.stock_mode == "weight":
            if self.pricing_method == "fixed_rate":
                raise ValueError("Fixed rate is not available for weighted items")
            if self.net_weight <= 0:
                raise ValueError("Total weight must be greater than 0")
            if self.stock_weight is None or self.stock_weight > self.net_weight:
                raise ValueError("Remaining weight must be between 0 and total weight")
            if (self.stock_weight > 0) != (self.quantity == 1):
                raise ValueError("Weighted-item quantity must match remaining weight")
        elif self.pricing_method == "fixed_rate":
            if self.fixed_rate <= 0:
                raise ValueError("Fixed rate must be greater than 0")
        elif self.net_weight <= 0:
            raise ValueError("Net weight must be greater than 0 for quantity-based items")
        return self

    @field_serializer(
        "purity",
        "net_weight",
        "making_charge",
        "fixed_rate",
        "stock_weight",
        "ratti",
        "rate_per_ratti",
    )
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        return None if value is None else float(value)


class ItemCreate(ItemBase):
    @model_validator(mode="after")
    def require_jewellery_identity(self) -> "ItemCreate":
        if self.item_type == "jewellery" and not {"metal", "purity"}.issubset(
            self.model_fields_set
        ):
            raise ValueError("Metal and purity are required for jewellery")
        if self.stock_mode == "weight" and self.stock_weight != self.net_weight:
            raise ValueError("New weighted items must start with their full total weight")
        return self


class ItemUpdate(BaseModel):
    sku: str | None = Field(default=None, min_length=1, max_length=50)
    barcode: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, min_length=1, max_length=20)
    item_type: ItemType | None = None
    pricing_method: PricingMethod | None = None
    stock_mode: StockMode | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    metal: str | None = Field(default=None, min_length=1, max_length=50)
    purity: Decimal | None = Field(None, ge=0, le=100)
    net_weight: Decimal | None = Field(None, ge=0)
    making_charge: Decimal | None = Field(None, ge=0)
    fixed_rate: Decimal | None = Field(None, ge=0)
    stock_weight: Decimal | None = Field(default=None, ge=0)
    ratti: Decimal | None = Field(default=None, gt=0)
    rate_per_ratti: Decimal | None = Field(default=None, gt=0)
    quantity: int | None = Field(None, ge=0)
    notes: str | None = Field(default=None, max_length=50)

    @field_validator("category", mode="before")
    @classmethod
    def normalize_category_value(cls, value: Any) -> Any:
        return normalize_category(str(value)) if value is not None else value


class ItemOut(ItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    status: str

    @computed_field  # type: ignore[prop-decorator]
    @property
    def hsn(self) -> str:
        return get_tax_profile(
            metal=self.metal,
            category=self.category,
            item_type=self.item_type,
        )["hsn"]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def gst_rate_percent(self) -> float:
        return float(
            get_tax_profile(
                metal=self.metal,
                category=self.category,
                item_type=self.item_type,
            )["gst_rate_percent"]
        )


class ItemPaginationOut(BaseModel):
    items: list[ItemOut]
    total: int
    page: int
    limit: int
    pages: int


class ItemBatchDelete(BaseModel):
    item_ids: list[UUID] = Field(min_length=1, max_length=200)

    @field_validator("item_ids")
    @classmethod
    def require_unique_item_ids(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("Item IDs must be unique")
        return value


class PricingBreakdown(BaseModel):
    category: str
    pricing_method: str
    item_type: str
    hsn: str
    rate_per_gram: float
    net_weight: float
    metal_value: float
    making_charge: float
    fixed_rate: float
    suggested_price: float
    subtotal: float
    gst_rate_percent: float
    gst_amount: float
    final_price: float


class ItemPOS(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    sku: str
    barcode: str | None
    category: str
    item_type: str
    pricing_method: str
    stock_mode: str
    name: str
    metal: str
    purity: float
    net_weight: float
    stock_weight: float | None
    ratti: float | None
    rate_per_ratti: float | None
    quantity: int
    status: str


class ItemPOSWithPrice(ItemPOS):
    pricing: PricingBreakdown | None
    requires_weight: bool = False


class WeightedQuoteInput(BaseModel):
    weight_grams: Decimal = Field(gt=0, decimal_places=3)
