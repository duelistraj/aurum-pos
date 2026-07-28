import logging
from types import SimpleNamespace
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError

from app.jobs import emails as worker


@pytest.mark.asyncio
async def test_email_delivery_uses_configured_sender(monkeypatch) -> None:
    outbox_id = uuid4()
    message = worker.EmailMessage(
        id=outbox_id,
        recipient="owner@example.com",
        subject="Verify your Aurum POS email",
        text_body="Verification link",
        html_body="<p>Verification link</p>",
        attempts=0,
    )
    sent_messages: list[dict] = []
    completions: list[tuple[object, str | None]] = []

    class FakeSesClient:
        def send_email(self, **payload) -> None:
            sent_messages.append(payload)

    async def run_inline(function) -> None:
        function()

    async def load(_outbox_id, *, claim_token):
        assert claim_token is None
        return message

    async def finish(finished_id, *, claim_token, error_code):
        assert claim_token is None
        completions.append((finished_id, error_code))

    monkeypatch.setattr(worker, "_load_email_message", load)
    monkeypatch.setattr(worker, "_finish_email", finish)
    monkeypatch.setattr(worker, "_ses_client", lambda: FakeSesClient())
    monkeypatch.setattr(worker.anyio.to_thread, "run_sync", run_inline)
    monkeypatch.setattr(worker.settings, "env", "production")
    monkeypatch.setattr(worker.settings, "email_from", "Aurum POS <noreply@aurumpos.net>")

    await worker.deliver_email(message.id)

    assert completions == [(outbox_id, None)]
    assert sent_messages == [
        {
            "Source": "Aurum POS <noreply@aurumpos.net>",
            "Destination": {"ToAddresses": ["owner@example.com"]},
            "Message": {
                "Subject": {"Data": "Verify your Aurum POS email", "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": "Verification link", "Charset": "UTF-8"},
                    "Html": {"Data": "<p>Verification link</p>", "Charset": "UTF-8"},
                },
            },
        }
    ]


@pytest.mark.asyncio
async def test_email_delivery_logs_safe_error_metadata(monkeypatch, caplog) -> None:
    recipient = "private-owner@example.com"
    message = worker.EmailMessage(
        id=uuid4(),
        recipient=recipient,
        subject="Verify your Aurum POS email",
        text_body="Sensitive verification link",
        html_body=None,
        attempts=0,
    )
    completion = SimpleNamespace(error_code=None)

    class FailingSesClient:
        def send_email(self, **_payload) -> None:
            raise ClientError(
                {
                    "Error": {
                        "Code": "AccessDenied",
                        "Message": f"Not authorized to send to {recipient}",
                    },
                },
                "SendEmail",
            )

    async def run_inline(function) -> None:
        function()

    async def load(_outbox_id, *, claim_token):
        assert claim_token is None
        return message

    async def finish(_finished_id, *, claim_token, error_code):
        assert claim_token is None
        completion.error_code = error_code

    monkeypatch.setattr(worker, "_load_email_message", load)
    monkeypatch.setattr(worker, "_finish_email", finish)
    monkeypatch.setattr(worker, "_ses_client", lambda: FailingSesClient())
    monkeypatch.setattr(worker.anyio.to_thread, "run_sync", run_inline)
    monkeypatch.setattr(worker.settings, "env", "production")
    monkeypatch.setattr(worker.settings, "email_from", "Aurum POS <noreply@aurumpos.net>")

    with caplog.at_level(logging.ERROR, logger="aurum.worker"):
        await worker.deliver_email(message.id)

    assert completion.error_code == "AccessDenied"
    assert f"Email delivery failed for outbox {message.id}: AccessDenied" in caplog.text
    assert recipient not in caplog.text
    assert "Sensitive verification link" not in caplog.text
