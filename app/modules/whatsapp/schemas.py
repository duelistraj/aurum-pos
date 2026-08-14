from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

WhatsAppDeliveryStatus = Literal[
    "pending",
    "processing",
    "accepted",
    "sent",
    "delivered",
    "read",
    "failed",
    "unknown",
]


class WhatsAppCapabilityOut(BaseModel):
    enabled: bool
    available: bool
    pro_required: bool = True
    sender_name: str
    template_status: str


class WhatsAppDeliveryCreate(BaseModel):
    confirm_customer_request: bool
    recipient_phone: str | None = Field(default=None, max_length=30)
    resend: bool = False


class WhatsAppDeliveryOut(BaseModel):
    delivery_id: UUID
    status: WhatsAppDeliveryStatus
    consent_confirmed_at: datetime
