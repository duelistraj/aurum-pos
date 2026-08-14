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
  fixed_rate?: number;
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
  tax_rate_percent: number;
  pricing: {
    metal_value: number;
    making_charge: number;
    fixed_rate?: number;
    suggested_price: number;
    subtotal: number;
    gst_rate_percent: number;
    gst_amount: number;
    final_price: number;
  };
}

export interface MetalRate {
  id?: string;
  metal: string;
  purity: number;
  rate_per_gram: number;
  effective_from?: string | null;
  created_at?: string | null;
}

export interface DashboardMetalRate {
  metal: string;
  rate_per_10g: number;
}

export interface AnalyticsMetalRate extends DashboardMetalRate {
  change_percentage: number;
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
  whatsapp_delivery_status?: string | null;
}

export interface InvoiceDownload {
  url: string;
  expires_in_seconds: number;
}

export type InvoicePdfStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface InvoiceSummary {
  sale_id: string;
  invoice_no: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  pdf_status: InvoicePdfStatus;
  pdf_generated_at: string | null;
  whatsapp_delivery_status: string | null;
  whatsapp_consent_confirmed_at: string | null;
}

export interface WhatsAppCapability {
  enabled: boolean;
  available: boolean;
  pro_required: boolean;
  sender_name: string;
  template_status: string;
}

export interface WhatsAppDelivery {
  delivery_id: string;
  status: string;
  consent_confirmed_at?: string;
}

export interface InvoicePage {
  invoices: InvoiceSummary[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  next_cursor_created_at?: string | null;
  next_cursor_id?: string | null;
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
  metal_rates?: DashboardMetalRate[];
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
  metal_rates?: AnalyticsMetalRate[];
  total_stock_value: number;
  total_stock_value_change_percentage: number;
  sales_overview: SalesOverviewPoint[];
  sales_by_category: CategoryShare[];
  inventory_summary: InventoryRatio;
  sales_trend: SalesTrendCompare;
}
