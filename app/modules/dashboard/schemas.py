from pydantic import BaseModel


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
    inventory_summary: InventoryRatio
    sales_trend: SalesTrendCompare
