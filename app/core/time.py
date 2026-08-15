from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

INDIA_TIMEZONE = ZoneInfo("Asia/Kolkata")


def india_day_bounds(now: datetime | None = None) -> tuple[date, datetime, datetime]:
    instant = now or datetime.now(UTC)
    local_now = instant.astimezone(INDIA_TIMEZONE)
    local_start = datetime.combine(
        local_now.date(),
        datetime.min.time(),
        tzinfo=INDIA_TIMEZONE,
    )
    local_end = local_start + timedelta(days=1)
    return local_now.date(), local_start.astimezone(UTC), local_end.astimezone(UTC)
