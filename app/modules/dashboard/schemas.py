from typing import Literal

from pydantic import BaseModel, Field

from app.modules.changelog.schemas import SoldChangeLogEntry


class CashierMetalRate(BaseModel):
    metal: Literal["gold", "silver", "platinum"]
    rate_per_10g: float


class CashierDashboardSummary(BaseModel):
    today_sales: float
    invoice_count: int
    recent_sold_activity: list[SoldChangeLogEntry] = Field(max_length=4)
    metal_rates: list[CashierMetalRate] = Field(min_length=3, max_length=3)


class CashierHourlySale(BaseModel):
    hour: int
    total_amount: float


class TopSellingItem(BaseModel):
    name: str
    sku: str
    sales_value: float
    sold_amount: float
    sold_unit: Literal["piece", "gram"]


class CashierAnalyticsResponse(BaseModel):
    date: str
    metal: Literal["all", "gold", "silver", "platinum", "stone"]
    total_sales: float
    invoice_count: int
    units_sold: int
    average_invoice_value: float
    sales_by_hour: list[CashierHourlySale] = Field(min_length=24, max_length=24)
    sales_by_category: list["CategoryShare"]
    top_selling_items: list[TopSellingItem] = Field(max_length=3)


class SalesOverviewPoint(BaseModel):
    date: str
    total_amount: float


class CategoryShare(BaseModel):
    category: str
    sales_value: float
    share: float


class InventoryRatio(BaseModel):
    in_stock_count: int
    in_stock_percentage: float
    sold_count: int
    sold_percentage: float
    total_count: int


class TrendPeriodValue(BaseModel):
    period: str
    sales_value: float


class SalesTrendCompare(BaseModel):
    current: TrendPeriodValue
    previous: TrendPeriodValue


class AnalyticsMetalRate(BaseModel):
    metal: str
    rate_per_10g: float
    change_percentage: float


class AnalyticsDashboardResponse(BaseModel):
    # KPI 1: Total Sales
    total_sales: float
    total_sales_change_percentage: float

    # KPI 2: Total Sale Value (Catalog Value of in-stock items)
    total_sale_value: float
    total_sale_value_change_percentage: float

    # KPI 3: Inventory Items
    inventory_items: int
    inventory_items_change_percentage: float

    # KPI 4: Silver Rate per 10g
    silver_rate_10g: float
    silver_rate_change_percentage: float
    metal_rates: list[AnalyticsMetalRate]

    # KPI 5: Total Stock Value
    total_stock_value: float
    total_stock_value_change_percentage: float

    # Charts & Breakdowns
    sales_overview: list[SalesOverviewPoint]
    sales_by_category: list[CategoryShare]
    top_selling_items: list[TopSellingItem] = Field(max_length=3)
    inventory_summary: InventoryRatio
    sales_trend: SalesTrendCompare
