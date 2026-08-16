from datetime import datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.jobs.storefront import webhook_signature
from app.modules.items.export import INVENTORY_EXPORT_FIELDS, INVENTORY_EXPORT_FORMAT
from app.modules.storefront.schemas import ReservationCreate
from app.modules.storefront.security import signature_for_request


def test_storefront_request_signature_covers_path_and_body() -> None:
    signature = signature_for_request(
        secret="request-secret",
        timestamp="123",
        method="POST",
        path="/api/v1/storefront/reservations",
        body=b'{"value":1}',
    )

    assert signature != signature_for_request(
        secret="request-secret",
        timestamp="123",
        method="POST",
        path="/api/v1/storefront/reservations",
        body=b'{"value":2}',
    )


def test_storefront_webhook_signature_covers_raw_body() -> None:
    signature = webhook_signature(secret="webhook-secret", timestamp="123", body=b"first")

    assert signature != webhook_signature(secret="webhook-secret", timestamp="123", body=b"second")


def test_inventory_export_v1_contains_source_and_availability_contract() -> None:
    assert INVENTORY_EXPORT_FORMAT == "aurum-pos-inventory-csv-v1"
    assert "item_id" in INVENTORY_EXPORT_FIELDS
    assert "barcode" in INVENTORY_EXPORT_FIELDS
    assert "available_quantity" in INVENTORY_EXPORT_FIELDS
    assert "inventory_version" in INVENTORY_EXPORT_FIELDS
    assert "final_unit_price" in INVENTORY_EXPORT_FIELDS


def test_enabled_storefront_requires_complete_configuration() -> None:
    with pytest.raises(ValidationError, match="Storefront integration requires"):
        Settings(
            _env_file=None,
            database_url="postgresql+asyncpg://example",
            jwt_secret_key="test-secret-key-that-is-long-enough",
            aws_region="ap-southeast-1",
            s3_invoice_bucket="test-bucket",
            storefront_integration_enabled=True,
            storefront_shop_id=uuid4(),
        )


def test_reservation_expiry_requires_an_explicit_timezone() -> None:
    with pytest.raises(ValidationError, match="timezone"):
        ReservationCreate(
            external_order_id="order-1",
            expires_at=datetime(2026, 8, 16, 12, 0),
            lines=[{"item_id": uuid4(), "quantity": 1}],
        )
