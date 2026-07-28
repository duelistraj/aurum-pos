from decimal import Decimal

from pydantic import BaseModel, Field


class MetalRateCreate(BaseModel):
    metal: str
    purity: Decimal = Field(gt=0, le=100)
    rate_per_gram: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
