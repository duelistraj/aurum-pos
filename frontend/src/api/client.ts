import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Capacitor } from '@capacitor/core';
import { PLAY_PRODUCT_ID } from '../constants/billing';
import {
  AnalyticsDashboardResponse,
  CashierAnalyticsResponse,
  CashierDashboardSummary,
  CashierItemLookup,
  ChangeLogEntry,
  ChangeLogPage,
  DashboardSummary,
  InvoiceDownload,
  InvoicePage,
  InvoicePdfStatus,
  Item,
  ItemPOSWithPrice,
  MetalRate,
  Sale,
  WhatsAppCapability,
  WhatsAppDelivery,
} from '../types';
import {
  clearAuthData,
  getAccessToken,
  getActiveShopId,
  getRefreshToken,
  MembershipInfo,
  setAuthData,
} from '../utils/auth';
import { getDeviceUUID } from '../utils/device';
import { getApiBaseUrl } from '../utils/apiConfig';

const client: AxiosInstance = axios.create({
  timeout: 15_000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});
let requestShopId: string | null | undefined;

export const setRequestShopId = (shopId: string | null) => {
  requestShopId = shopId;
};

// Error message mapping for different status codes
const ERROR_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your input.',
  401: 'Unauthorized. Please log in again.',
  403: 'Forbidden. You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  422: 'Validation error. Please check your input.',
  429: 'Too many requests. Please try again later.',
  500: 'Server error. Please try again later.',
  502: 'Bad gateway. The server is temporarily unavailable.',
  503: 'Service unavailable. Please try again later.',
};
const CREDENTIAL_ENDPOINTS = new Set([
  '/auth/google',
  '/auth/invitations/accept',
  '/auth/login',
]);

client.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const [apiBaseUrl, token, deviceUuid, persistedShopId] = await Promise.all([
      getApiBaseUrl(),
      getAccessToken(),
      getDeviceUUID(),
      getActiveShopId(),
    ]);
    config.baseURL = `${apiBaseUrl}/api/v1`;
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (deviceUuid) {
      config.headers['X-Device-UUID'] = deviceUuid;
    }
    const shopId = requestShopId === undefined ? persistedShopId : requestShopId;
    if (shopId) {
      config.headers['X-Shop-ID'] = shopId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

interface RetriableRequest extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface RefreshQueueEntry {
  resolve: (token: string) => void;
  reject: (reason: unknown) => void;
}

interface ValidationIssue {
  loc?: Array<string | number>;
  msg?: string;
}

interface StructuredErrorDetail {
  code?: string;
  message?: string;
  email?: string;
  full_name?: string;
}

interface ApiErrorBody {
  detail?: string | ValidationIssue[] | StructuredErrorDetail;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  full_name: string;
  user_id: string;
  email: string;
  memberships: MembershipInfo[];
}

interface LoginPayload {
  email: string;
  password: string;
  device_uuid: string;
  device_name: string;
  platform: string;
  app_version: string;
}

interface RegisterPayload extends LoginPayload {
  full_name: string;
  shop_name: string;
}

interface GoogleAuthPayload extends Omit<LoginPayload, 'email' | 'password'> {
  id_token: string;
  nonce: string;
  shop_name?: string;
  invitation_token?: string;
}

interface AuthProvidersResponse {
  google: {
    enabled: boolean;
    client_id: string | null;
  };
}

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly detail?: StructuredErrorDetail;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      detail?: StructuredErrorDetail;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.detail = options.detail;
  }
}

interface InvitationAcceptPayload extends LoginPayload {
  token: string;
  full_name: string;
}

let isRefreshing = false;
let failedQueue: RefreshQueueEntry[] = [];
let refreshPromise: Promise<TokenResponse> | null = null;

const processQueue = (error: unknown, token?: string) => {
  failedQueue.forEach((pendingRequest) => {
    if (error) {
      pendingRequest.reject(error);
    } else if (token) {
      pendingRequest.resolve(token);
    }
  });
  failedQueue = [];
};

const requestFreshSession = async (): Promise<TokenResponse> => {
  const refreshToken = await getRefreshToken();
  const [apiBaseUrl, deviceUuid] = await Promise.all([
    getApiBaseUrl(),
    getDeviceUUID(),
  ]);
  const { data } = await axios.post<TokenResponse>(
    `${apiBaseUrl}/api/v1/auth/refresh`,
    {
      refresh_token: refreshToken || undefined,
      device_uuid: deviceUuid,
    },
    { withCredentials: true },
  );
  await setAuthData(data.access_token, data.refresh_token, {
    full_name: data.full_name,
    user_id: data.user_id,
    email: data.email,
    memberships: data.memberships,
  });
  client.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
  return data;
};

const refreshAuthentication = (): Promise<TokenResponse> => {
  if (refreshPromise) return refreshPromise;

  const refresh = async () => {
    if (
      !Capacitor.isNativePlatform()
      && typeof navigator !== 'undefined'
      && navigator.locks
    ) {
      return navigator.locks.request('aurum-pos-refresh', requestFreshSession);
    }
    return requestFreshSession();
  };

  refreshPromise = refresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
};

// Error response interceptor
client.interceptors.response.use(
  (response) => {
    // If we receive an HTML response (like the Vite/Capacitor SPA fallback), throw an error
    // instead of passing it to components which expect JSON and would crash using .map()
    if (typeof response.data === 'string' && response.data.trim().toLowerCase().startsWith('<!doctype html>')) {
      return Promise.reject(new Error('Received HTML page instead of API response. Check backend API URL configuration.'));
    }
    return response;
  },
  (error: AxiosError<ApiErrorBody>) => {
    const originalRequest = error.config as RetriableRequest | undefined;

    const isCredentialEndpoint = originalRequest?.url
      ? CREDENTIAL_ENDPOINTS.has(originalRequest.url)
      : false;
    if (
      error.response?.status === 401
      && originalRequest
      && !originalRequest._retry
      && !isCredentialEndpoint
    ) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return client(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      return (async () => {
        try {
          const data = await refreshAuthentication();
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          processQueue(undefined, data.access_token);
          return client(originalRequest);
        } catch (err) {
          processQueue(err);
          await clearAuthData({ notify: 'session-expired' });
          setRequestShopId(null);
          window.location.replace('/login');
          return Promise.reject(err);
        } finally {
          isRefreshing = false;
        }
      })();
    }

    let errorMessage = 'An unexpected error occurred';

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 422 && Array.isArray(data?.detail)) {
        const validationErrors = data.detail.map((issue) => {
          const field = issue.loc?.[1] || 'field';
          const msg = issue.msg || 'Invalid value';
          return `${field}: ${msg}`;
        }).join(', ');
        errorMessage = validationErrors || ERROR_MESSAGES[422];
      } else if (typeof data?.detail === 'string') {
        errorMessage = data.detail;
      } else if (data?.detail && !Array.isArray(data.detail) && data.detail.message) {
        errorMessage = data.detail.message;
      } else if (ERROR_MESSAGES[status]) {
        errorMessage = ERROR_MESSAGES[status];
      }
    } else if (error.request) {
      errorMessage = 'No response from server. Please check your connection and backend API URL.';
    }

    const structuredDetail = error.response?.data?.detail;
    const customError = new ApiError(errorMessage, {
      status: error.response?.status,
      code: structuredDetail && !Array.isArray(structuredDetail)
        && typeof structuredDetail !== 'string'
        ? structuredDetail.code
        : undefined,
      detail: structuredDetail && !Array.isArray(structuredDetail)
        && typeof structuredDetail !== 'string'
        ? structuredDetail
        : undefined,
    });
    return Promise.reject(customError);
  }
);

type SaleCreatePayload = {
  items: Array<{ item_id: string; quantity?: number; weight_grams?: number }>;
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  total_amount?: number;
  send_invoice_via_whatsapp?: boolean;
};

export const apiClient = {
  // Auth
  async restoreSession() {
    if (await getAccessToken()) return true;
    if (Capacitor.isNativePlatform()) return false;
    try {
      await refreshAuthentication();
      return true;
    } catch {
      await clearAuthData();
      setRequestShopId(null);
      return false;
    }
  },

  async authProviders() {
    const apiBaseUrl = await getApiBaseUrl();
    const { data } = await axios.get<AuthProvidersResponse>(
      `${apiBaseUrl}/api/v1/auth/providers`,
    );
    return data;
  },

  async login(payload: LoginPayload) {
    const { data } = await client.post<TokenResponse>('/auth/login', payload);
    return data;
  },

  async register(payload: RegisterPayload) {
    const { data } = await client.post<{
      message: string;
      verification_token?: string;
    }>('/auth/register', payload);
    return data;
  },

  async googleAuth(payload: GoogleAuthPayload) {
    const { data } = await client.post<TokenResponse>('/auth/google', payload);
    return data;
  },

  async acceptInvitation(payload: InvitationAcceptPayload) {
    const { data } = await client.post<TokenResponse>('/auth/invitations/accept', payload);
    return data;
  },

  async verifyEmail(token: string) {
    const { data } = await client.post<{ message: string }>('/auth/verify-email', { token });
    return data;
  },

  async resendVerification(email: string) {
    const { data } = await client.post<{ message: string }>(
      '/auth/verification/resend',
      { email },
    );
    return data;
  },

  async requestAccountDeletion(email: string, deleteOwnedShops: boolean) {
    const { data } = await client.post<{ message: string }>(
      '/auth/account-deletion/request',
      { email, delete_owned_shops: deleteOwnedShops },
    );
    return data;
  },

  async listShops() {
    const { data } = await client.get<Array<{
      id: string;
      organization_id: string;
      organization_name: string;
      is_primary: boolean;
      access_mode: 'read_write' | 'read_only';
      name: string;
      slug: string;
      role: string;
      legal_name: string | null;
      tax_id: string | null;
      phone: string | null;
      address: string | null;
      state: string | null;
      state_code: string | null;
      invoice_prefix: string | null;
      tax_rate_percent?: number;
    }>>('/shops');
    return data;
  },

  async createShop(organizationId: string, name: string) {
    const { data } = await client.post<{
      id: string;
      organization_id: string;
      organization_name: string;
      is_primary: boolean;
      access_mode: 'read_write' | 'read_only';
      name: string;
      slug: string;
      role: string;
    }>(`/organizations/${organizationId}/shops`, { name });
    return data;
  },

  async updateShop(
    shopId: string,
    payload: {
      name?: string;
      legal_name?: string;
      tax_id?: string;
      phone?: string;
      address?: string;
      state?: string;
      state_code?: string;
      invoice_prefix?: string;
    },
  ) {
    const { data } = await client.patch(`/shops/${shopId}`, payload);
    return data;
  },

  async listStaff(shopId: string) {
    const { data } = await client.get<Array<{
      id: string;
      user_id: string;
      email: string;
      full_name: string;
      role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER';
      is_active: boolean;
      created_at: string;
    }>>(`/shops/${shopId}/members`);
    return data;
  },

  async updateStaff(
    shopId: string,
    membershipId: string,
    payload: {
      role?: 'ADMIN' | 'MANAGER' | 'CASHIER';
      is_active?: boolean;
    },
  ) {
    const { data } = await client.patch(
      `/shops/${shopId}/members/${membershipId}`,
      payload,
    );
    return data;
  },

  async transferShopOwnership(shopId: string, targetMembershipId: string) {
    const { data } = await client.post(
      `/shops/${shopId}/ownership`,
      { target_membership_id: targetMembershipId },
    );
    return data;
  },

  async transferOrganizationOwnership(
    organizationId: string,
    targetMembershipId: string,
  ) {
    const { data } = await client.post<{
      id: string;
      organization_id: string;
      target_user_id: string;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      created_at: string;
      completed_at: string | null;
    }>(
      `/organizations/${organizationId}/ownership-transfers`,
      { target_membership_id: targetMembershipId },
    );
    return data;
  },

  async inviteStaff(
    shopId: string,
    payload: { email: string; role: 'ADMIN' | 'MANAGER' | 'CASHIER' },
  ) {
    const { data } = await client.post<{
      id: string;
      email: string;
      role: string;
      expires_at: string;
      token?: string;
    }>(`/shops/${shopId}/invitations`, payload);
    return data;
  },

  async listPendingInvitations(shopId: string) {
    const { data } = await client.get<Array<{
      id: string;
      shop_id: string;
      email: string;
      role: 'ADMIN' | 'MANAGER' | 'CASHIER';
      expires_at: string;
      created_at: string;
    }>>(`/shops/${shopId}/invitations`);
    return data;
  },

  async revokeInvitation(shopId: string, invitationId: string) {
    await client.delete(`/shops/${shopId}/invitations/${invitationId}`);
  },
  
  async logout() {
    try {
      await client.post('/auth/logout');
    } finally {
      await clearAuthData({ notify: 'logout' });
      setRequestShopId(null);
    }
  },

  // Health check
  async health() {
    const apiBaseUrl = await getApiBaseUrl();
    const { data } = await axios.get<{ status: string; app: string; env: string }>(
      `${apiBaseUrl}/health/live`,
    );
    return data;
  },

  async version() {
    const apiBaseUrl = await getApiBaseUrl();
    const { data } = await axios.get<{
      version: string;
      revision: string;
      license: string;
      source: string;
      deployment_mode: string;
    }>(`${apiBaseUrl}/api/v1/version`);
    return data;
  },

  async getEntitlement() {
    const { data } = await client.get<{
      organization_id: string;
      plan: 'free' | 'pro';
      source: string;
      active_item_limit: number | null;
      active_item_count: number;
      can_add_item: boolean;
      shop_limit: number | null;
      shop_count: number;
      team_seat_limit: number | null;
      team_seat_usage: number;
      can_create_shop: boolean;
      can_invite_member: boolean;
      access_mode: 'read_write' | 'read_only';
      expires_at: string | null;
    }>('/subscriptions/entitlement');
    return data;
  },

  async submitPlayPurchase(purchaseToken: string) {
    const { data } = await client.post('/billing/google-play/purchases', {
      purchase_token: purchaseToken,
      product_id: PLAY_PRODUCT_ID,
    });
    return data;
  },

  // Items
  async getItems(params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    status?: string;
    metal?: string;
  }) {
    const { data } = await client.get<{
      items: Item[];
      total: number;
      page: number;
      limit: number;
      pages: number;
    }>('/items/', { params });
    return data;
  },

  async getItemsSummary() {
    const { data } = await client.get<{
      total_items: number;
      in_stock: number;
      unique_items: number;
      sold_items: number;
      items_925_count: number;
      metal_summaries?: Record<string, {
        in_stock: number;
        sold_items: number;
        unique_items: number;
        purity_counts: Record<string, number>;
      }>;
    }>('/items/summary');
    return data;
  },

  async getItemById(id: string) {
    const { data } = await client.get<Item>(`/items/${id}`);
    return data;
  },

  async getItemByBarcode(barcode: string) {
    const { data } = await client.get<Item>(`/items/barcode/${barcode}`);
    return data;
  },

  async getCashierItemByBarcode(barcode: string) {
    const { data } = await client.get<CashierItemLookup>(
      `/items/cashier/barcode/${encodeURIComponent(barcode)}`,
    );
    return data;
  },

  async getItemForPOS(barcode: string) {
    const { data } = await client.get<ItemPOSWithPrice>(`/items/pos/scan/${barcode}`);
    return data;
  },

  async quoteWeightedItem(itemId: string, weightGrams: number) {
    const { data } = await client.post<ItemPOSWithPrice>(`/items/pos/quote/${itemId}`, {
      weight_grams: weightGrams,
    });
    return data;
  },

  async createItem(item: Omit<Item, 'id' | 'status'>) {
    const { data } = await client.post<Item>('/items/', item);
    return data;
  },

  async getLatestItem() {
    const { data } = await client.get<Item>('/items/latest');
    return data;
  },

  async updateItem(id: string, item: Omit<Item, 'id' | 'status'>) {
    const { data } = await client.patch<Item>(`/items/${id}`, item);
    return data;
  },

  async deleteItem(id: string) {
    await client.delete(`/items/${id}`);
  },

  async deleteItems(itemIds: string[]) {
    await client.post('/items/delete/batch', { item_ids: itemIds });
  },

  async getBatchLabels(itemIds: string[], format: 'xlsx' | 'pdf' = 'xlsx') {
    const response = await client.post('/items/labels/batch', itemIds, {
      params: { format },
      responseType: 'arraybuffer',
    });
    return response.data;
  },

  // Metal Rates
  async getAvailableMetals() {
    const { data } = await client.get<Record<string, number[]>>('/metal-rates/available');
    return data;
  },

  async getAllMetalRates() {
    const { data } = await client.get<MetalRate[]>('/metal-rates');
    return data;
  },

  async addMetalRate(rate: MetalRate) {
    const { data } = await client.post<MetalRate>('/metal-rates/', rate);
    return data;
  },

  // Sales
  async createSale(sale: SaleCreatePayload, idempotencyKey: string) {
    const { data } = await client.post<Sale>('/sales/', {
      items: sale.items.map(item => ({
        item_id: item.item_id,
        ...(item.weight_grams === undefined
          ? { quantity: item.quantity }
          : { weight_grams: item.weight_grams }),
      })),
      customer_name: sale.customer_name,
      customer_phone: sale.customer_phone,
      customer_address: sale.customer_address,
      total_amount: sale.total_amount,
      send_invoice_via_whatsapp: sale.send_invoice_via_whatsapp ?? false,
    }, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return data;
  },

  async getSaleByIdempotencyKey(idempotencyKey: string) {
    const { data } = await client.get<Sale>(
      `/sales/idempotency/${encodeURIComponent(idempotencyKey)}`,
    );
    return data;
  },

  async getDashboardSummary() {
    const { data } = await client.get<DashboardSummary>('/dashboard/summary');
    return data;
  },

  async getCashierDashboardSummary() {
    const { data } = await client.get<CashierDashboardSummary>('/dashboard/cashier/summary');
    return data;
  },

  async getDashboardAnalytics(from_date: string, to_date: string, metal: string) {
    const { data } = await client.get<AnalyticsDashboardResponse>('/dashboard/analytics', {
      params: { from_date, to_date, metal },
    });
    return data;
  },

  async getCashierAnalytics(metal: string) {
    const { data } = await client.get<CashierAnalyticsResponse>('/dashboard/cashier/analytics', {
      params: { metal },
    });
    return data;
  },

  async getChangeLogHistory(params: {
    barcode?: string;
    invoice_no?: string;
    action?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  }) {
    const { data } = await client.get<ChangeLogPage | ChangeLogEntry[]>('/change-log/history', {
      params,
    });
    if (Array.isArray(data)) {
      const limit = params.limit ?? 50;
      return {
        entries: data,
        total: data.length,
        page: params.page ?? 1,
        limit,
        pages: data.length > 0 ? Math.ceil(data.length / limit) : 0,
      };
    }
    return data;
  },

  async getCashierSoldHistory(params: {
    barcode?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  }) {
    const { data } = await client.get<ChangeLogPage>('/change-log/sold', { params });
    return data;
  },

  // Invoices
  async listInvoices(params: {
    page?: number;
    limit?: number;
    search?: string;
    from_date?: string;
    to_date?: string;
    pdf_status?: InvoicePdfStatus;
    cursor_created_at?: string;
    cursor_id?: string;
  }) {
    const { data } = await client.get<InvoicePage>('/sales/invoices', { params });
    return data;
  },

  async getInvoiceDownload(saleId: string) {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const { data } = await client.get<
        InvoiceDownload | { status: 'pending'; retry_after_seconds: number }
      >(`/sales/${saleId}/invoice`);
      if ('url' in data) return data;
      await new Promise((resolve) => {
        window.setTimeout(resolve, Math.max(1, data.retry_after_seconds) * 1000);
      });
    }
    throw new Error(
      'Invoice is still being prepared. You can download it from Transactions shortly.',
    );
  },

  async getInvoicePdf(saleId: string) {
    const response = await client.get<ArrayBuffer>(`/sales/${saleId}/invoice/content`, {
      responseType: 'arraybuffer',
    });
    return response.data;
  },

  async getWhatsAppCapability() {
    const { data } = await client.get<WhatsAppCapability>('/whatsapp/capability');
    return data;
  },

  async sendInvoiceToWhatsApp(
    saleId: string,
    payload: {
      confirm_customer_request: boolean;
      recipient_phone?: string;
      resend?: boolean;
    },
    idempotencyKey: string,
  ) {
    const { data } = await client.post<WhatsAppDelivery>(
      `/sales/${saleId}/whatsapp-deliveries`,
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return data;
  },
};

export default apiClient;
