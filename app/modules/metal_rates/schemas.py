from decimal import Decimal

from pydantic import BaseModel


class MetalRateCreate(BaseModel):
    metal: str
    purity: Decimal
    rate_per_gram: Decimal
