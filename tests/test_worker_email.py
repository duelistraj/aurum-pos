from types import SimpleNamespace

import pytest

from app import worker


class FakeSession:
    def __init__(self, message: SimpleNamespace) -> None:
        self.message = message

    async def scalar(self, _statement):
        return self.message


class FakeTransaction:
    def __init__(self, message: SimpleNamespace) -> None:
        self.session = FakeSession(message)

    async def __aenter__(self) -> FakeSession:
        return self.session

    async def __aexit__(self, _exc_type, _exc, _traceback) -> None:
        return None


class FakeSessionFactory:
    def __init__(self, message: SimpleNamespace) -> None:
        self.message = message

    def begin(self) -> FakeTransaction:
        return FakeTransaction(self.message)


@pytest.mark.asyncio
async def test_email_delivery_uses_configured_sender(monkeypatch) -> None:
    message = SimpleNamespace(
        id="email-id",
        recipient="owner@example.com",
        subject="Verify your Aurum POS email",
        text_body="Verification link",
        status="pending",
        attempts=0,
        next_attempt_at=None,
        sent_at=None,
    )
    sent_messages: list[dict] = []

    class FakeSesClient:
        def send_email(self, **payload) -> None:
            sent_messages.append(payload)

    async def run_inline(function) -> None:
        function()

    monkeypatch.setattr(worker, "AsyncSessionLocal", FakeSessionFactory(message))
    monkeypatch.setattr(worker.boto3, "client", lambda *_args, **_kwargs: FakeSesClient())
    monkeypatch.setattr(worker.anyio.to_thread, "run_sync", run_inline)
    monkeypatch.setattr(worker.settings, "env", "production")
    monkeypatch.setattr(worker.settings, "email_from", "Aurum POS <noreply@aurumpos.net>")
    monkeypatch.setattr(worker.settings, "ses_region", "ap-southeast-1")

    await worker.deliver_email(message.id)

    assert message.status == "sent"
    assert message.sent_at is not None
    assert sent_messages == [
        {
            "Source": "Aurum POS <noreply@aurumpos.net>",
            "Destination": {"ToAddresses": ["owner@example.com"]},
            "Message": {
                "Subject": {"Data": "Verify your Aurum POS email"},
                "Body": {"Text": {"Data": "Verification link"}},
            },
        }
    ]
