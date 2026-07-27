import hashlib
import math
from datetime import UTC, datetime

from fastapi import HTTPException, Request
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.auth.models import AuthRateLimit


def _window_start(now: datetime, window_seconds: int) -> datetime:
    epoch_seconds = math.floor(now.timestamp())
    return datetime.fromtimestamp(
        epoch_seconds - (epoch_seconds % window_seconds),
        tz=UTC,
    )


def _subject_hash(value: str) -> str:
    return hashlib.sha256(value.strip().casefold().encode()).hexdigest()


async def _increment(scope: str, subject: str, limit: int, now: datetime) -> int:
    window_started_at = _window_start(now, settings.auth_rate_limit_window_seconds)
    statement = (
        insert(AuthRateLimit)
        .values(
            scope=scope,
            subject_hash=_subject_hash(subject),
            window_started_at=window_started_at,
            request_count=1,
        )
        .on_conflict_do_update(
            index_elements=[
                AuthRateLimit.scope,
                AuthRateLimit.subject_hash,
                AuthRateLimit.window_started_at,
            ],
            set_={"request_count": AuthRateLimit.request_count + 1},
        )
        .returning(AuthRateLimit.request_count)
    )
    async with AsyncSessionLocal.begin() as session:
        count = (await session.execute(statement)).scalar_one()
    if count > limit:
        retry_after = settings.auth_rate_limit_window_seconds - (
            math.floor(now.timestamp()) % settings.auth_rate_limit_window_seconds
        )
        raise HTTPException(
            status_code=429,
            detail="Too many authentication attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    return count


async def enforce_auth_rate_limit(
    request: Request,
    *,
    scope: str,
    account: str | None = None,
) -> None:
    now = datetime.now(UTC)
    client_ip = request.client.host if request.client else "unknown"
    await _increment(
        f"{scope}:ip",
        client_ip,
        settings.auth_rate_limit_per_ip,
        now,
    )
    if account:
        await _increment(
            f"{scope}:account",
            account,
            settings.auth_rate_limit_per_account,
            now,
        )
