from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class ChangeLogEntry(BaseModel):
    id: UUID
    entity: str
    action: str
    payload: dict[str, Any]
    created_at: datetime


class ChangeLogPage(BaseModel):
    entries: list[ChangeLogEntry]
    total: int
    page: int
    limit: int
    pages: int
