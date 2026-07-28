import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from uuid import UUID, uuid4

import anyio
import boto3
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import or_, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.notifications.models import EmailOutbox

LOGGER = logging.getLogger("aurum.worker.email")
EMAIL_LEASE = timedelta(minutes=10)


@dataclass(frozen=True)
class EmailMessage:
    id: UUID
    recipient: str
    subject: str
    text_body: str
    html_body: str | None
    attempts: int
    claim_token: UUID | None = None


@dataclass(frozen=True)
class EmailClaim:
    outbox_id: UUID
    claim_token: UUID


@lru_cache
def _ses_client():
    return boto3.client("ses", region_name=settings.ses_region)


async def _load_email_message(
    outbox_id: UUID,
    *,
    claim_token: UUID | None = None,
) -> EmailMessage | None:
    async with AsyncSessionLocal.begin() as session:
        conditions = [EmailOutbox.id == outbox_id]
        if claim_token is not None:
            conditions.append(EmailOutbox.claim_token == claim_token)
        message = await session.scalar(select(EmailOutbox).where(*conditions))
        if message is None or message.status != "processing":
            return None
        return EmailMessage(
            id=message.id,
            recipient=message.recipient,
            subject=message.subject,
            text_body=message.text_body,
            html_body=message.html_body,
            attempts=message.attempts,
            claim_token=message.claim_token,
        )


async def _finish_email(
    outbox_id: UUID,
    *,
    claim_token: UUID | None,
    error_code: str | None,
) -> None:
    async with AsyncSessionLocal.begin() as session:
        message = await session.scalar(
            select(EmailOutbox)
            .where(
                EmailOutbox.id == outbox_id,
                EmailOutbox.claim_token == claim_token,
            )
            .with_for_update()
        )
        if message is None or message.status != "processing":
            return
        now = datetime.now(UTC)
        message.claimed_at = None
        message.claim_token = None
        if error_code is None:
            message.status = "sent"
            message.sent_at = now
            message.last_error_code = None
            return
        message.attempts += 1
        message.last_error_code = error_code
        if message.attempts >= settings.worker_email_max_attempts:
            message.status = "failed"
            message.next_attempt_at = None
        else:
            message.status = "pending"
            message.next_attempt_at = now + timedelta(minutes=min(60, 2**message.attempts))


async def deliver_email(
    outbox_id: UUID,
    *,
    claim_token: UUID | None = None,
) -> None:
    message = await _load_email_message(outbox_id, claim_token=claim_token)
    if message is None:
        return
    error_code: str | None = None
    try:
        if settings.env == "local":
            LOGGER.info("Email queued locally: %s", message.subject)
        else:

            def send() -> None:
                _ses_client().send_email(
                    Source=settings.email_from,
                    Destination={"ToAddresses": [message.recipient]},
                    Message={
                        "Subject": {"Data": message.subject, "Charset": "UTF-8"},
                        "Body": {
                            "Text": {"Data": message.text_body, "Charset": "UTF-8"},
                            **(
                                {
                                    "Html": {
                                        "Data": message.html_body,
                                        "Charset": "UTF-8",
                                    }
                                }
                                if message.html_body
                                else {}
                            ),
                        },
                    },
                )

            await anyio.to_thread.run_sync(send)
    except Exception as exc:
        if isinstance(exc, ClientError):
            error_code = str(exc.response.get("Error", {}).get("Code", "ClientError"))
        elif isinstance(exc, BotoCoreError):
            error_code = type(exc).__name__
        else:
            error_code = type(exc).__name__
        LOGGER.error("Email delivery failed for outbox %s: %s", message.id, error_code)
    await _finish_email(
        message.id,
        claim_token=message.claim_token,
        error_code=error_code,
    )


async def _claim_email_batch() -> list[EmailClaim]:
    async with AsyncSessionLocal.begin() as session:
        now = datetime.now(UTC)
        result = await session.execute(
            select(EmailOutbox)
            .where(
                or_(
                    (
                        (EmailOutbox.status == "pending")
                        & or_(
                            EmailOutbox.next_attempt_at.is_(None),
                            EmailOutbox.next_attempt_at <= now,
                        )
                    ),
                    (
                        (EmailOutbox.status == "processing")
                        & (EmailOutbox.claimed_at < now - EMAIL_LEASE)
                    ),
                )
            )
            .order_by(EmailOutbox.created_at)
            .limit(20)
            .with_for_update(skip_locked=True)
        )
        messages = list(result.scalars())
        for message in messages:
            message.status = "processing"
            message.claimed_at = now
            message.claim_token = uuid4()
        return [
            EmailClaim(
                outbox_id=message.id,
                claim_token=message.claim_token,
            )
            for message in messages
            if message.claim_token is not None
        ]


async def process_email_batch() -> None:
    claims = await _claim_email_batch()
    semaphore = asyncio.Semaphore(settings.worker_email_concurrency)

    async def deliver(claim: EmailClaim) -> None:
        async with semaphore:
            await deliver_email(
                claim.outbox_id,
                claim_token=claim.claim_token,
            )

    await asyncio.gather(*(deliver(claim) for claim in claims))
