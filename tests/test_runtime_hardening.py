import argparse
import asyncio
import json
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, func, select, text

from app.cli import _manifest_digest, import_items
from app.core.database import AsyncSessionLocal
from app.jobs import emails
from app.modules.auth.dependencies import AuthContext, get_shop_context
from app.modules.auth.models import AuthToken, Device, User
from app.modules.auth.rate_limit import _increment
from app.modules.auth.service import request_password_reset
from app.modules.dashboard.routes import dashboard_analytics
from app.modules.items.models import Item, ItemHistory
from app.modules.notifications.models import EmailOutbox
from app.modules.shops.models import Organization, ShopDeviceAccess
from tests.support import create_test_shop


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
        device = Device(
            id=device_id,
            user_id=user_id,
            device_uuid=f"device-{device_id}",
            device_name="Parallel test",
            platform="test",
            app_version="test",
        )
        session.add_all([user, device])
        await create_test_shop(
            session,
            shop_id=shop_id,
            name="Device Race Shop",
            slug=f"device-race-{shop_id}",
            owner_user_id=user_id,
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
        await session.execute(delete(Organization).where(Organization.id == shop_id))
        await session.execute(delete(User).where(User.id == user_id))


@pytest.mark.integration
@pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested")
@pytest.mark.asyncio
async def test_item_import_creates_analytics_baseline(tmp_path) -> None:
    shop_id = uuid4()
    item_id = uuid4()
    timestamp = datetime.now(UTC).isoformat()
    async with AsyncSessionLocal.begin() as session:
        await create_test_shop(
            session,
            shop_id=shop_id,
            name="Import Baseline",
            slug=f"import-{shop_id}",
        )

    rows = [
        {
            "id": str(item_id),
            "sku": "IMPORT-1",
            "barcode": "99887766",
            "category": "jewellery",
            "name": "Imported item",
            "metal": "silver",
            "purity": 92.5,
            "net_weight": 2.5,
            "making_charge": 100,
            "quantity": 3,
            "status": "in_stock",
            "notes": None,
            "created_at": timestamp,
            "updated_at": timestamp,
        }
    ]
    source = tmp_path / "items.json"
    source.write_text(
        json.dumps(
            {
                "format": "aurum-pos-item-export-v1",
                "count": len(rows),
                "sha256": _manifest_digest(rows),
                "items": rows,
            }
        )
    )

    await import_items(argparse.Namespace(file=str(source), shop=str(shop_id)))

    async with AsyncSessionLocal.begin() as session:
        await session.execute(select(func.set_config("app.current_shop_id", str(shop_id), True)))
        item = await session.get(Item, item_id)
        history = await session.scalar(
            select(ItemHistory).where(
                ItemHistory.shop_id == shop_id,
                ItemHistory.item_id == item_id,
            )
        )
        assert item is not None
        assert history is not None
        assert history.event_type == "baseline"
        assert history.quantity == item.quantity
        await session.execute(delete(Organization).where(Organization.id == shop_id))


@pytest.mark.integration
@pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested")
@pytest.mark.asyncio
async def test_runtime_role_rls_blocks_unscoped_cross_shop_reads() -> None:
    async with AsyncSessionLocal() as session:
        is_superuser = await session.scalar(
            text("SELECT rolsuper FROM pg_roles WHERE rolname = current_user")
        )
    if is_superuser:
        pytest.skip("The local PostgreSQL owner bypasses row-level security")

    first_shop_id = uuid4()
    second_shop_id = uuid4()
    async with AsyncSessionLocal.begin() as session:
        await create_test_shop(
            session,
            shop_id=first_shop_id,
            name="First RLS",
            slug=f"first-rls-{first_shop_id}",
        )
        await create_test_shop(
            session,
            shop_id=second_shop_id,
            name="Second RLS",
            slug=f"second-rls-{second_shop_id}",
        )
        for shop_id, barcode in (
            (first_shop_id, "11112222"),
            (second_shop_id, "33334444"),
        ):
            await session.execute(
                select(func.set_config("app.current_shop_id", str(shop_id), True))
            )
            session.add(
                Item(
                    shop_id=shop_id,
                    sku=f"RLS-{barcode}",
                    barcode=barcode,
                    category="jewellery",
                    name="RLS item",
                    metal="silver",
                    purity=92.5,
                    net_weight=1,
                    making_charge=1,
                    quantity=1,
                )
            )
            await session.flush()

    async with AsyncSessionLocal.begin() as session:
        await session.execute(
            select(func.set_config("app.current_shop_id", str(first_shop_id), True))
        )
        visible_items = list((await session.execute(select(Item))).scalars())
        assert {item.shop_id for item in visible_items} == {first_shop_id}
        await session.execute(
            delete(Organization).where(Organization.id.in_((first_shop_id, second_shop_id)))
        )


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
