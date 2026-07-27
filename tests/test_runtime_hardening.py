import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.modules.auth.rate_limit import _increment
from app.modules.dashboard.routes import dashboard_analytics


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
