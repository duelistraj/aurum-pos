export interface Item {
  id: string;
  sku: string;
  barcode: string;
  category: string;
  item_type?: 'jewellery' | 'stone';
  pricing_method?: 'fixed_rate' | 'fixed_making_charge' | 'making_charge_per_gram' | 'rate_per_ratti';
  stock_mode?: 'quantity' | 'weight';
  name: string;
  metal: string;
  purity: number;
  net_weight: number;
  making_charge: number;
  fixed_rate?: number;
  stock_weight?: number | null;
  ratti?: number | null;
  rate_per_ratti?: number | null;
  hsn?: string;
  gst_rate_percent?: number;
  quantity: number;
  notes: string | null;
  status: string;
}

export interface ItemPOSWithPrice {
  id: string;
  sku: string;
  barcode: string | null;
  category: string;
  item_type?: 'jewellery' | 'stone';
  pricing_method?: Item['pricing_method'];
  stock_mode?: Item['stock_mode'];
  name: string;
  metal: string;
  purity: number;
  net_weight: number;
  stock_weight?: number | null;
  ratti?: number | null;
  rate_per_ratti?: number | null;
  quantity: number;
  status: string;
  requires_weight?: boolean;
  pricing: {
    metal_value: number;
    making_charge: number;
    fixed_rate?: number;
    suggested_price: number;
    subtotal: number;
    gst_rate_percent: number;
    gst_amount: number;
    final_price: number;
  } | null;
}

export interface CashierItemLookup {
  barcode: string;
  sku: string;
  name: string;
  category: string;
  item_type: 'jewellery' | 'stone';
  metal: string;
  purity: number | null;
  net_weight: number | null;
  ratti: number | null;
  status: 'in_stock' | 'sold';
  hsn: string;
  gst_rate_percent: number;
  price: {
    state: 'available' | 'requires_weight' | 'rate_unavailable';
    amount: number | null;
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
  quantity?: number;
  weight_grams?: number;
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

export type AuditActorKind = 'user' | 'system' | 'unknown';
export type AuditDetailKind = 'changes' | 'facts' | 'sale';

export interface AuditActor {
  kind: AuditActorKind;
  user_id: string | null;
  name: string;
  role: string | null;
}

export interface AuditActorOption {
  user_id: string;
  name: string;
  role: string | null;
}

export interface AuditSubject {
  type: string;
  id: string;
  label: string;
  reference: string | null;
}

export interface AuditChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

export interface AuditFact {
  label: string;
  value: unknown;
}

export interface AuditSaleItem {
  item_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  quantity: number | null;
  weight_grams: number | null;
  amount: number;
}

export interface AuditLogEntry {
  id: string;
  event_type: string;
  area: string;
  subject: AuditSubject;
  actor: AuditActor;
  summary: string;
  details: {
    kind: AuditDetailKind;
    changes: AuditChange[];
    facts: AuditFact[];
    sale_items: AuditSaleItem[];
    total: number | null;
  };
  created_at: string;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface SoldTransaction {
  id: string;
  item_id: string;
  item_name: string;
  sku: string | null;
  barcode: string | null;
  invoice_no: string | null;
  quantity: number | null;
  weight_grams: number | null;
  amount: number;
  created_at: string;
}

export interface SoldTransactionPage {
  entries: SoldTransaction[];
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

export interface CashierDashboardSummary {
  today_sales: number;
  invoice_count: number;
  units_sold: number;
  recent_sold_activity: SoldTransaction[];
  metal_rates: DashboardMetalRate[];
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

export interface TopSellingItem {
  name: string;
  sku: string;
  sales_value: number;
  sold_amount: number;
  sold_unit: 'piece' | 'gram';
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
  top_selling_items: TopSellingItem[];
  inventory_summary: InventoryRatio;
  sales_trend: SalesTrendCompare;
}

export interface CashierAnalyticsResponse {
  date: string;
  metal: 'all' | 'gold' | 'silver' | 'platinum' | 'stone';
  total_sales: number;
  invoice_count: number;
  units_sold: number;
  average_invoice_value: number;
  sales_by_hour: Array<{ hour: number; total_amount: number }>;
  sales_by_category: CategoryShare[];
  top_selling_items: TopSellingItem[];
}
