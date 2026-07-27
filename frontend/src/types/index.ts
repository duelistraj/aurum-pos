export interface Item {
  id: string;
  sku: string;
  barcode: string;
  category: string;
  name: string;
  metal: string;
  purity: number;
  net_weight: number;
  making_charge: number;
  quantity: number;
  notes: string | null;
  status: string;
}

export interface ItemPOSWithPrice {
  id: string;
  sku: string;
  barcode: string | null;
  category: string;
  name: string;
  metal: string;
  purity: number;
  net_weight: number;
  quantity: number;
  status: string;
  pricing: {
    metal_value: number;
    making_charge: number;
    suggested_price: number;
  };
}

export interface MetalRate {
  metal: string;
  purity: number;
  rate_per_gram: number;
}

export interface SaleItem {
  item_id: string;
  quantity: number;
  item?: Item;
  pricing?: Record<string, string | number | null>;
}

export interface Sale {
  id: string;
  invoice_no: string;
  items: SaleItem[];
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  total_amount: number;
}

export interface InvoiceDownload {
  url: string;
  expires_in_seconds: number;
}

export interface ChangeLogEntry {
  id: string;
  entity: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string | null;
}

export interface ChangeLogPage {
  entries: ChangeLogEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface DashboardSummary {
  inventory_items: number;
  total_stock_value: number;
  Silver_rate_per_10g: number;
  total_sales_amount: number;
  total_sale_value: number;
  recent_activity: ChangeLogEntry[];
}

export interface CustomerDetails {
  name: string;
  phone: string;
  address?: string;
}

export interface SalesOverviewPoint {
  date: string;
  total_amount: number;
}

export interface CategoryShare {
  category: string;
  sales_value: number;
  share: number;
}

export interface InventoryRatio {
  in_stock_count: number;
  in_stock_percentage: number;
  sold_count: number;
  sold_percentage: number;
  total_count: number;
}

export interface TrendPeriodValue {
  period: string;
  sales_value: number;
}

export interface SalesTrendCompare {
  current: TrendPeriodValue;
  previous: TrendPeriodValue;
}

export interface AnalyticsDashboardResponse {
  total_sales: number;
  total_sales_change_percentage: number;
  total_sale_value: number;
  total_sale_value_change_percentage: number;
  inventory_items: number;
  inventory_items_change_percentage: number;
  silver_rate_10g: number;
  silver_rate_change_percentage: number;
  total_stock_value: number;
  total_stock_value_change_percentage: number;
  sales_overview: SalesOverviewPoint[];
  sales_by_category: CategoryShare[];
  inventory_summary: InventoryRatio;
  sales_trend: SalesTrendCompare;
}
