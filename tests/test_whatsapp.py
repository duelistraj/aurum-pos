import hashlib
import hmac
import json
import os
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.sales.models import Sale
from app.modules.whatsapp.models import (
    WhatsAppDeliveryJob,
    WhatsAppInvoiceDelivery,
    WhatsAppRecipientSuppression,
)
from app.modules.whatsapp.provider import MetaWhatsAppClient
from app.modules.whatsapp.routes import _record_status, _verify_signature
from app.modules.whatsapp.service import (
    get_capability,
    normalize_whatsapp_phone,
    queue_invoice_delivery,
    recipient_hmac,
)
from tests.support import create_test_shop


@pytest.mark.asyncio
async def test_whatsapp_capability_remains_unavailable_without_pro(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class CapabilitySession:
        async def get(self, _model, _key):
            return None

    async def free_entitlement(_db, _organization_id):
        return SimpleNamespace(plan="free")

    monkeypatch.setattr(settings, "whatsapp_enabled", True)
    monkeypatch.setattr(settings, "deployment_mode", "hosted")
    monkeypatch.setattr(settings, "whatsapp_template_status", "approved")
    monkeypatch.setattr(
        "app.modules.whatsapp.service.resolve_entitlement",
        free_entitlement,
    )

    capability = await get_capability(
        CapabilitySession(),  # type: ignore[arg-type]
        organization_id=uuid4(),
    )

    assert capability["enabled"] is True
    assert capability["available"] is False
    assert capability["pro_required"] is True


@pytest.mark.parametrize(
    ("raw", "normalized"),
    [
        ("99999 99999", "+919999999999"),
        ("+91-99999-99999", "+919999999999"),
        ("00919999999999", "+919999999999"),
    ],
)
def test_normalize_whatsapp_phone(raw: str, normalized: str) -> None:
    assert normalize_whatsapp_phone(raw) == normalized


@pytest.mark.parametrize("raw", ["", "123", "+0123456789", "not-a-phone"])
def test_normalize_whatsapp_phone_rejects_invalid_numbers(raw: str) -> None:
    with pytest.raises(HTTPException) as raised:
        normalize_whatsapp_phone(raw)
    assert raised.value.status_code == 422


def test_recipient_identifier_is_a_keyed_digest(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "whatsapp_recipient_hmac_key", "test-hmac-key")

    digest = recipient_hmac("+919999999999")

    assert (
        digest
        == hmac.new(
            b"test-hmac-key",
            b"+919999999999",
            hashlib.sha256,
        ).hexdigest()
    )
    assert "+919999999999" not in digest


def test_webhook_signature_must_match_the_raw_request_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "whatsapp_app_secret", "meta-app-secret")
    body = b'{"object":"whatsapp_business_account"}'
    signature = (
        "sha256="
        + hmac.new(
            b"meta-app-secret",
            body,
            hashlib.sha256,
        ).hexdigest()
    )

    _verify_signature(body, signature)
    with pytest.raises(HTTPException) as raised:
        _verify_signature(body + b" ", signature)
    assert raised.value.status_code == 401


@pytest.mark.asyncio
async def test_shared_sender_uses_only_the_utility_invoice_template(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "whatsapp_access_token", "aurum-token")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "aurum-sender-id")
    monkeypatch.setattr(settings, "whatsapp_template_name", "aurum_invoice_delivery_v1")
    captured_message: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/media"):
            return httpx.Response(200, json={"id": "media-1"})
        captured_message.update(json.loads(request.content))
        return httpx.Response(200, json={"messages": [{"id": "wamid.1"}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = MetaWhatsAppClient(client=client)
        media_id = await provider.upload_invoice(
            pdf=b"%PDF invoice",
            filename="INV-1.pdf",
        )
        message_id = await provider.send_invoice_template(
            recipient_e164="+919999999999",
            media_id=media_id,
            filename="INV-1.pdf",
            business_name="Demo Shop",
            invoice_number="INV-1",
            amount=Decimal("12500.00"),
            delivery_id="delivery-1",
        )

    assert message_id == "wamid.1"
    assert captured_message["to"] == "919999999999"
    assert captured_message["biz_opaque_callback_data"] == "delivery-1"
    template = captured_message["template"]
    assert isinstance(template, dict)
    assert template["name"] == "aurum_invoice_delivery_v1"
    assert "marketing" not in json.dumps(captured_message).lower()


@pytest.mark.integration
@pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested")
@pytest.mark.asyncio
async def test_delivery_consent_is_durable_and_reestablishes_an_opted_out_recipient(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    suffix = uuid4().hex
    shop_id = uuid4()
    phone = f"9{int(suffix[:8], 16) % 1_000_000_000:09d}"

    async def pro_entitlement(_db, _organization_id):
        return SimpleNamespace(plan="pro")

    monkeypatch.setattr(settings, "whatsapp_enabled", True)
    monkeypatch.setattr(settings, "deployment_mode", "hosted")
    monkeypatch.setattr(settings, "whatsapp_template_status", "approved")
    monkeypatch.setattr(settings, "whatsapp_recipient_hmac_key", "integration-hmac-key")
    monkeypatch.setattr(
        "app.modules.whatsapp.service.resolve_entitlement",
        pro_entitlement,
    )
    digest = recipient_hmac(f"+91{phone}")

    async with AsyncSessionLocal.begin() as session:
        organization, shop, user_id = await create_test_shop(
            session,
            shop_id=shop_id,
            name=f"WhatsApp Integration {suffix}",
            slug=f"whatsapp-{suffix}",
        )
        await session.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(shop.id)},
        )
        sale = Sale(
            shop_id=shop.id,
            invoice_no=f"WA-{suffix[:12]}",
            total_amount=Decimal("12500.00"),
            customer_name="WhatsApp Customer",
            customer_phone=phone,
        )
        session.add(sale)
        session.add(
            WhatsAppRecipientSuppression(
                recipient_hmac=digest,
                reason="recipient_opt_out",
            )
        )
        await session.flush()

        delivery = await queue_invoice_delivery(
            session,
            sale=sale,
            organization_id=organization.id,
            shop_id=shop.id,
            user_id=user_id,
            phone=sale.customer_phone,
            source="invoice_history",
            idempotency_key=f"history:{suffix}",
            confirm_customer_request=True,
        )
        delivery_id = delivery.id
        with pytest.raises(HTTPException) as duplicate:
            await queue_invoice_delivery(
                session,
                sale=sale,
                organization_id=organization.id,
                shop_id=shop.id,
                user_id=user_id,
                phone=sale.customer_phone,
                source="invoice_history",
                idempotency_key=f"history-resend:{suffix}",
                confirm_customer_request=True,
                resend=True,
            )
        assert duplicate.value.status_code == 409
        assert duplicate.value.detail["code"] == "DELIVERY_ALREADY_PENDING"

    async with AsyncSessionLocal.begin() as session:
        row_security = (
            await session.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity "
                    "FROM pg_class WHERE relname = 'whatsapp_invoice_deliveries'"
                )
            )
        ).one()
        assert row_security.relrowsecurity is True
        assert row_security.relforcerowsecurity is True
        job = await session.get(WhatsAppDeliveryJob, delivery_id)
        suppression = await session.get(WhatsAppRecipientSuppression, digest)
        assert job is not None
        assert job.shop_id == shop_id
        assert suppression is not None
        assert suppression.cleared_at is not None
        assert suppression.reconsented_delivery_id == delivery_id
        await session.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(shop_id)},
        )
        persisted = await session.scalar(
            select(WhatsAppInvoiceDelivery).where(
                WhatsAppInvoiceDelivery.id == delivery_id,
                WhatsAppInvoiceDelivery.shop_id == shop_id,
            )
        )
        assert persisted is not None
        assert persisted.consent_copy_version == "shared_aurum_invoice_v1"
        assert persisted.recipient_e164 == f"+91{phone}"
        job.status = "unknown"
        persisted.status = "unknown"
        await session.flush()

        await _record_status(
            session,
            {
                "id": f"wamid.{suffix}",
                "status": "sent",
                "timestamp": "1786435200",
                "biz_opaque_callback_data": str(delivery_id),
            },
        )

        assert job.status == "sent"
        assert job.meta_message_id == f"wamid.{suffix}"
        assert persisted.status == "sent"
        assert persisted.sent_at is not None
