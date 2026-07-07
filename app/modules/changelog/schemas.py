from datetime import datetime
from pydantic import BaseModel
from typing import Any
from uuid import UUID


class ChangeLogEntry(BaseModel):
    id: UUID
    entity: str
    action: str
    payload: dict[str, Any]
    created_at: datetime
