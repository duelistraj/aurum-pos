import pytest
from pydantic import ValidationError

from app.modules.dashboard.schemas import CashierAnalyticsResponse, CashierDashboardSummary
from app.modules.items.schemas import CashierItemLookupOut


def test_cashier_item_response_has_a_strict_public_field_allowlist() -> None:
    response = CashierItemLookupOut.model_validate(
        {
            "barcode": "12345678",
            "sku": "RING-1",
            "name": "Gold Ring",
            "category": "ring",
            "item_type": "jewellery",
            "metal": "gold",
            "purity": 91.6,
            "net_weight": 4.5,
            "ratti": None,
            "status": "in_stock",
            "hsn": "7113",
            "gst_rate_percent": 3,
            "price": {"state": "available", "amount": 15000},
            "id": "private-id",
            "quantity": 7,
            "stock_weight": 12.5,
            "making_charge": 500,
            "fixed_rate": 15000,
            "rate_per_ratti": 0,
            "notes": "private note",
        }
    )

    assert set(response.model_dump()) == {
        "barcode",
        "sku",
        "name",
        "category",
        "item_type",
        "metal",
        "purity",
        "net_weight",
        "ratti",
        "status",
        "hsn",
        "gst_rate_percent",
        "price",
    }


def test_cashier_dashboard_requires_all_three_display_rates() -> None:
    response = CashierDashboardSummary.model_validate(
        {
            "today_sales": 0,
            "invoice_count": 0,
            "units_sold": 0,
            "recent_sold_activity": [],
            "metal_rates": [
                {"metal": "gold", "rate_per_10g": 0},
                {"metal": "silver", "rate_per_10g": 0},
                {"metal": "platinum", "rate_per_10g": 0},
            ],
        }
    )

    assert [rate.metal for rate in response.metal_rates] == ["gold", "silver", "platinum"]


def test_cashier_dashboard_sold_activity_has_a_strict_payload_allowlist() -> None:
    response = CashierDashboardSummary.model_validate(
        {
            "today_sales": 1500,
            "invoice_count": 1,
            "units_sold": 1,
            "recent_sold_activity": [
                {
                    "id": "00000000-0000-0000-0000-000000000001",
                    "item_id": "00000000-0000-0000-0000-000000000002",
                    "item_name": "Gold Ring",
                    "sku": "RING-1",
                    "barcode": "12345678",
                    "invoice_no": "INV-2026-000001",
                    "quantity": 1,
                    "weight_grams": None,
                    "amount": 1500,
                    "notes": "must not leak",
                    "created_at": "2026-08-15T08:30:00Z",
                }
            ],
            "metal_rates": [
                {"metal": "gold", "rate_per_10g": 0},
                {"metal": "silver", "rate_per_10g": 0},
                {"metal": "platinum", "rate_per_10g": 0},
            ],
        }
    )

    assert response.invoice_count == 1
    assert response.units_sold == 1
    assert response.recent_sold_activity[0].model_dump(exclude={"id", "item_id", "created_at"}) == {
        "item_name": "Gold Ring",
        "sku": "RING-1",
        "barcode": "12345678",
        "invoice_no": "INV-2026-000001",
        "quantity": 1,
        "weight_grams": None,
        "amount": 1500,
    }


def test_cashier_dashboard_rejects_more_than_three_recent_items() -> None:
    activity = {
        "id": "00000000-0000-0000-0000-000000000001",
        "item_id": "00000000-0000-0000-0000-000000000002",
        "item_name": "Gold Ring",
        "sku": "RING-1",
        "barcode": "12345678",
        "invoice_no": "INV-2026-000001",
        "quantity": 1,
        "weight_grams": None,
        "amount": 1500,
        "created_at": "2026-08-15T08:30:00Z",
    }

    with pytest.raises(ValidationError):
        CashierDashboardSummary.model_validate(
            {
                "today_sales": 1500,
                "invoice_count": 1,
                "units_sold": 1,
                "recent_sold_activity": [activity] * 4,
                "metal_rates": [
                    {"metal": "gold", "rate_per_10g": 0},
                    {"metal": "silver", "rate_per_10g": 0},
                    {"metal": "platinum", "rate_per_10g": 0},
                ],
            }
        )


def test_cashier_analytics_contract_has_every_hour_of_the_day() -> None:
    response = CashierAnalyticsResponse.model_validate(
        {
            "date": "2026-08-15",
            "metal": "all",
            "total_sales": 0,
            "invoice_count": 0,
            "units_sold": 0,
            "average_invoice_value": 0,
            "sales_by_hour": [{"hour": hour, "total_amount": 0} for hour in range(24)],
            "sales_by_category": [],
            "top_selling_items": [
                {
                    "name": "Gold Ring",
                    "sku": "RING-1",
                    "sales_value": 15000,
                    "sold_amount": 1,
                    "sold_unit": "piece",
                    "item_id": "private-item-id",
                }
            ],
        }
    )

    assert [point.hour for point in response.sales_by_hour] == list(range(24))
    assert response.top_selling_items[0].model_dump() == {
        "name": "Gold Ring",
        "sku": "RING-1",
        "sales_value": 15000.0,
        "sold_amount": 1.0,
        "sold_unit": "piece",
    }
