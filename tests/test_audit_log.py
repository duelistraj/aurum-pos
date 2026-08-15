from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.core.changelog.service import AuditActor, log_change
from app.core.time import india_day_bounds
from app.modules.auth import models as _auth_models
from app.modules.changelog.schemas import AuditLogEntry, SoldTransactionEntry
from app.modules.changelog.service import _audit_event_filter
from app.modules.sales import models as _sales_models
from app.modules.shops import models as _shop_models

_ORM_MODEL_MODULES = (_auth_models, _sales_models, _shop_models)


class RecordingSession:
    def __init__(self) -> None:
        self.entries = []

    def add(self, entry) -> None:
        self.entries.append(entry)


@pytest.mark.asyncio
async def test_log_change_preserves_normalized_actor_and_subject_snapshots() -> None:
    session = RecordingSession()
    shop_id = uuid4()
    item_id = uuid4()
    user_id = uuid4()

    await log_change(
        session,  # type: ignore[arg-type]
        shop_id=shop_id,
        entity="item",
        entity_id=item_id,
        action="update",
        event_type="inventory.item_updated",
        subject_label="Gold Ring",
        reference="12345678",
        actor=AuditActor.user(user_id=user_id, name="Mira Manager", role="MANAGER"),
        payload={"barcode": "12345678", "changes": {}},
    )

    entry = session.entries[0]
    assert entry.shop_id == shop_id
    assert entry.event_type == "inventory.item_updated"
    assert entry.subject_label == "Gold Ring"
    assert entry.reference == "12345678"
    assert entry.actor_kind == "user"
    assert entry.actor_user_id == user_id
    assert entry.actor_name == "Mira Manager"
    assert entry.actor_role == "MANAGER"


def test_historical_audit_entry_accepts_an_unknown_actor_without_sensitive_payload() -> None:
    entry = AuditLogEntry.model_validate(
        {
            "id": uuid4(),
            "event_type": "inventory.item_created",
            "area": "Inventory",
            "subject": {
                "type": "item",
                "id": uuid4(),
                "label": "Gold Ring",
                "reference": "12345678",
            },
            "actor": {"kind": "unknown", "name": "Unknown"},
            "summary": "Added Gold Ring",
            "details": {
                "kind": "facts",
                "facts": [{"label": "Barcode", "value": "12345678"}],
            },
            "created_at": "2026-08-15T08:30:00Z",
            "customer_phone": "must not leak",
        }
    )

    assert entry.actor.kind == "unknown"
    assert "customer_phone" not in entry.model_dump()


def test_sold_transaction_contract_ignores_unapproved_fields() -> None:
    entry = SoldTransactionEntry.model_validate(
        {
            "id": uuid4(),
            "item_id": uuid4(),
            "item_name": "Gold Ring",
            "sku": "RING-1",
            "barcode": "12345678",
            "invoice_no": "INV-1",
            "quantity": 1,
            "weight_grams": None,
            "amount": 1500,
            "created_at": "2026-08-15T08:30:00Z",
            "notes": "private stock note",
            "pricing": {"internal": True},
        }
    )

    assert set(entry.model_dump()) == {
        "id",
        "item_id",
        "item_name",
        "sku",
        "barcode",
        "invoice_no",
        "quantity",
        "weight_grams",
        "amount",
        "created_at",
    }


def test_india_day_bounds_switch_at_ist_midnight() -> None:
    previous_date, previous_start, previous_end = india_day_bounds(
        datetime(2026, 8, 14, 18, 29, tzinfo=UTC)
    )
    current_date, current_start, current_end = india_day_bounds(
        datetime(2026, 8, 14, 18, 30, tzinfo=UTC)
    )

    assert previous_date.isoformat() == "2026-08-14"
    assert current_date.isoformat() == "2026-08-15"
    assert previous_start.isoformat() == "2026-08-13T18:30:00+00:00"
    assert previous_end == current_start
    assert current_end.isoformat() == "2026-08-15T18:30:00+00:00"


def test_ownership_transfer_filter_groups_requested_and_completed_events() -> None:
    clause = _audit_event_filter("team.ownership_transfer")
    sql = str(
        clause.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )

    assert "team.ownership_transfer_requested" in sql
    assert "team.ownership_transfer_completed" in sql
    assert " IN " in sql
