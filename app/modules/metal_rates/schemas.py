from pydantic import BaseModel


class MetalRateCreate(BaseModel):
    metal: str
    purity: float
    rate_per_gram: float
