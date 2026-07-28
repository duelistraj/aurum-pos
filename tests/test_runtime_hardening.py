import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, func, select

from app.core.database import AsyncSessionLocal
from app.jobs import emails
from app.modules.auth.dependencies import AuthContext, get_shop_context
from app.modules.auth.models import AuthToken, Device, User
from app.modules.auth.rate_limit import _increment
from app.modules.auth.service import request_password_reset
from app.modules.dashboard.routes import dashboard_analytics
from app.modules.notifications.models import EmailOutbox
from app.modules.shops.models import Shop, ShopDeviceAccess, ShopMembership


@pytest.mark.asyncio
async def test_dashboard_rejects_reversed_and_unbounded_ranges() -> None:
    now = datetime.now(UTC)
    with pytest.raises(HTTPException) as reversed_range:
        await dashboard_analytics(
            from_date=now,
            to_date=now - timedelta(days=1),
            metal="all",
            context=None,  # type: ignore[arg-type]
            db=None,  # type: ignore[arg-type]
        )
    assert reversed_range.value.status_code == 422

    with pytest.raises(HTTPException) as oversized_range:
        await dashboard_analytics(
            from_date=now - timedelta(days=367),
            to_date=now,
            metal="all",
            context=None,  # type: ignore[arg-type]
            db=None,  # type: ignore[arg-type]
        )
    assert oversized_range.value.status_code == 422


@pytest.mark.integration
@pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested")
@pytest.mark.asyncio
async def test_postgres_auth_rate_limit_is_enforced() -> None:
    subject = f"rate-test-{uuid4()}"
    scope = f"test:{uuid4()}"
    now = datetime.now(UTC)

    assert await _increment(scope, subject, 1, now) == 1
    with pytest.raises(HTTPException) as limited:
        await _increment(scope, subject, 1, now)

    assert limited.value.status_code == 429
    assert "Retry-After" in limited.value.headers


@pytest.mark.integration
@pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested")
@pytest.mark.asyncio
async def test_parallel_first_shop_access_is_conflict_safe() -> None:
    user_id = uuid4()
    shop_id = uuid4()
    device_id = uuid4()
    async with AsyncSessionLocal.begin() as session:
        user = User(
            id=user_id,
            email=f"device-race-{user_id}@example.com",
            full_name="Device Race",
        )
        shop = Shop(id=shop_id, name="Device Race Shop", slug=f"device-race-{shop_id}")
        device = Device(
            id=device_id,
            user_id=user_id,
            device_uuid=f"device-{device_id}",
            device_name="Parallel test",
            platform="test",
            app_version="test",
        )
        session.add_all([user, shop, device])
        await session.flush()
        session.add(
            ShopMembership(
                shop_id=shop_id,
                user_id=user_id,
                role="OWNER",
                is_active=True,
            )
        )

    context = AuthContext(
        user=user,
        device=device,
        session_id=uuid4(),
        device_uuid=device.device_uuid,
    )

    async def open_shop():
        async with AsyncSessionLocal.begin() as session:
            return await get_shop_context(
                x_shop_id=shop_id,
                context=context,
                device=device,
                db=session,
            )

    first, second = await asyncio.gather(open_shop(), open_shop())
    assert first.shop.id == shop_id
    assert second.shop.id == shop_id

    async with AsyncSessionLocal.begin() as session:
        access_count = await session.scalar(
            select(func.count(ShopDeviceAccess.id)).where(
                ShopDeviceAccess.shop_id == shop_id,
                ShopDeviceAccess.device_id == device_id,
            )
        )
        assert access_count == 1
        await session.execute(delete(Shop).where(Shop.id == shop_id))
        await session.execute(delete(User).where(User.id == user_id))


@pytest.mark.integration
@pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested")
@pytest.mark.asyncio
async def test_new_password_reset_invalidates_previous_tokens(monkeypatch) -> None:
    user_id = uuid4()
    email = f"reset-single-use-{user_id}@example.com"
    issued_tokens = iter(("first-reset-token", "second-reset-token"))
    monkeypatch.setattr(
        "app.modules.auth.service.generate_opaque_token",
        lambda: next(issued_tokens),
    )
    async with AsyncSessionLocal.begin() as session:
        session.add(User(id=user_id, email=email, full_name="Reset Test"))
    async with AsyncSessionLocal.begin() as session:
        await request_password_reset(session, email)
    async with AsyncSessionLocal.begin() as session:
        await request_password_reset(session, email)

    async with AsyncSessionLocal.begin() as session:
        tokens = list(
            (
                await session.execute(
                    select(AuthToken)
                    .where(
                        AuthToken.user_id == user_id,
                        AuthToken.purpose == "reset_password",
                    )
                    .order_by(AuthToken.created_at, AuthToken.id)
                )
            ).scalars()
        )
        assert len(tokens) == 2
        assert tokens[0].consumed_at is not None
        assert tokens[1].consumed_at is None
        await session.execute(delete(User).where(User.id == user_id))
        await session.execute(delete(EmailOutbox).where(EmailOutbox.recipient == email))


@pytest.mark.integration
@pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested")
@pytest.mark.asyncio
async def test_stale_email_worker_cannot_finalize_reclaimed_message() -> None:
    outbox_id = uuid4()
    current_claim = uuid4()
    async with AsyncSessionLocal.begin() as session:
        session.add(
            EmailOutbox(
                id=outbox_id,
                recipient="fencing@example.com",
                subject="Fencing test",
                text_body="Fencing test",
                status="processing",
                claimed_at=datetime.now(UTC),
                claim_token=current_claim,
            )
        )

    await emails._finish_email(
        outbox_id,
        claim_token=uuid4(),
        error_code=None,
    )
    async with AsyncSessionLocal.begin() as session:
        message = await session.get(EmailOutbox, outbox_id)
        assert message is not None
        assert message.status == "processing"
        assert message.claim_token == current_claim

    await emails._finish_email(
        outbox_id,
        claim_token=current_claim,
        error_code=None,
    )
    async with AsyncSessionLocal.begin() as session:
        message = await session.get(EmailOutbox, outbox_id)
        assert message is not None
        assert message.status == "sent"
        assert message.claim_token is None
        await session.delete(message)
