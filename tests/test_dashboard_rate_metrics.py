from decimal import Decimal

from app.modules.dashboard.service import (
    _analytics_rate_metrics,
    _dashboard_rate_metrics,
)


def test_dashboard_rate_metrics_are_ordered_and_configured_only() -> None:
    assert _dashboard_rate_metrics(
        {
            "platinum": Decimal("42000"),
            "silver": Decimal("1000"),
            "gold": Decimal("70000"),
        }
    ) == [
        {"metal": "gold", "rate_per_10g": 70000.0},
        {"metal": "silver", "rate_per_10g": 1000.0},
        {"metal": "platinum", "rate_per_10g": 42000.0},
    ]


def test_analytics_rate_metrics_follow_filter_and_calculate_change() -> None:
    current = {
        "gold": Decimal("75000"),
        "silver": Decimal("1100"),
    }
    previous = {
        "gold": Decimal("60000"),
        "silver": Decimal("1000"),
    }

    assert _analytics_rate_metrics(current, previous, metal="all") == [
        {"metal": "gold", "rate_per_10g": 75000.0, "change_percentage": 25.0},
        {"metal": "silver", "rate_per_10g": 1100.0, "change_percentage": 10.0},
    ]
    assert _analytics_rate_metrics(current, previous, metal="silver") == [
        {"metal": "silver", "rate_per_10g": 1100.0, "change_percentage": 10.0}
    ]
    assert _analytics_rate_metrics(current, previous, metal="platinum") == []
