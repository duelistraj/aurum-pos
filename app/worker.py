import argparse
import asyncio
import logging
from datetime import UTC, datetime, timedelta

import anyio
import boto3
from sqlalchemy import delete, func, or_, select, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.auth.models import AccountDeletionRequest, User
from app.modules.billing.service import decrypt_purchase_token, verify_play_purchase
from app.modules.notifications.models import EmailOutbox
from app.modules.shops.models import Shop, ShopMembership
from app.modules.subscriptions.models import PlaySubscription

LOGGER = logging.getLogger("aurum.worker")


async def deliver_email(outbox_id) -> None:
    async with AsyncSessionLocal.begin() as session:
        message = await session.scalar(
            select(EmailOutbox).where(EmailOutbox.id == outbox_id).with_for_update()
        )
        if message is None or message.status != "pending":
            return
        try:
            if settings.env == "local":
                LOGGER.info("Email to %s: %s", message.recipient, message.subject)
            else:
                client = boto3.client("ses", region_name=settings.ses_region)

                def send() -> None:
                    client.send_email(
                        Source=settings.email_from,
                        Destination={"ToAddresses": [message.recipient]},
                        Message={
                            "Subject": {"Data": message.subject},
                            "Body": {"Text": {"Data": message.text_body}},
                        },
                    )

                await anyio.to_thread.run_sync(send)
            message.status = "sent"
            message.sent_at = datetime.now(UTC)
        except Exception:
            message.attempts += 1
            message.next_attempt_at = datetime.now(UTC) + timedelta(
                minutes=min(60, 2**message.attempts)
            )
            LOGGER.exception("Email delivery failed for outbox %s", message.id)


async def process_email_batch() -> None:
    async with AsyncSessionLocal.begin() as session:
        now = datetime.now(UTC)
        result = await session.execute(
            select(EmailOutbox.id)
            .where(
                EmailOutbox.status == "pending",
                or_(EmailOutbox.next_attempt_at.is_(None), EmailOutbox.next_attempt_at <= now),
            )
            .order_by(EmailOutbox.created_at)
            .limit(20)
            .with_for_update(skip_locked=True)
        )
        ids = list(result.scalars())
    for outbox_id in ids:
        await deliver_email(outbox_id)


async def reconcile_play_subscriptions() -> None:
    async with AsyncSessionLocal.begin() as session:
        result = await session.execute(select(PlaySubscription))
        play_subscriptions = list(result.scalars())
    for play in play_subscriptions:
        try:
            async with AsyncSessionLocal.begin() as session:
                await session.execute(
                    text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                    {"shop_id": str(play.shop_id)},
                )
                await verify_play_purchase(
                    session,
                    shop_id=play.shop_id,
                    purchase_token=decrypt_purchase_token(play.purchase_token),
                    product_id=play.product_id,
                )
        except Exception:
            LOGGER.exception("Play reconciliation failed for shop %s", play.shop_id)


async def process_account_deletions() -> None:
    async with AsyncSessionLocal.begin() as session:
        now = datetime.now(UTC)
        result = await session.execute(
            select(AccountDeletionRequest.id).where(
                AccountDeletionRequest.confirmed_at.is_not(None),
                AccountDeletionRequest.cancelled_at.is_(None),
                AccountDeletionRequest.completed_at.is_(None),
                AccountDeletionRequest.execute_after <= now,
            )
        )
        request_ids = list(result.scalars())
    for request_id in request_ids:
        async with AsyncSessionLocal.begin() as session:
            request = await session.scalar(
                select(AccountDeletionRequest)
                .where(AccountDeletionRequest.id == request_id)
                .with_for_update()
            )
            if (
                request is None
                or request.completed_at is not None
                or request.cancelled_at is not None
                or request.user_id is None
            ):
                continue
            owner_rows = await session.execute(
                select(ShopMembership).where(
                    ShopMembership.user_id == request.user_id,
                    ShopMembership.role == "OWNER",
                    ShopMembership.is_active.is_(True),
                )
            )
            for membership in owner_rows.scalars():
                other_owners = await session.scalar(
                    select(func.count(ShopMembership.id)).where(
                        ShopMembership.shop_id == membership.shop_id,
                        ShopMembership.user_id != request.user_id,
                        ShopMembership.role == "OWNER",
                        ShopMembership.is_active.is_(True),
                    )
                )
                if not other_owners and request.delete_owned_shops:
                    await session.execute(delete(Shop).where(Shop.id == membership.shop_id))
            user = await session.get(User, request.user_id)
            if user is not None:
                await session.delete(user)
                await session.flush()
            request.completed_at = datetime.now(UTC)


async def run_once(*, reconcile: bool) -> None:
    await process_email_batch()
    await process_account_deletions()
    if reconcile:
        await reconcile_play_subscriptions()


async def run_forever() -> None:
    reconcile_counter = 0
    while True:
        await run_once(reconcile=reconcile_counter == 0)
        reconcile_counter = (reconcile_counter + 1) % 360
        await asyncio.sleep(10)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_once(reconcile=True) if args.once else run_forever())


if __name__ == "__main__":
    main()
