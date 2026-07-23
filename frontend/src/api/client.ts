import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { PLAY_PRODUCT_ID } from '../constants/billing';
import { Item, MetalRate, Sale, ItemPOSWithPrice, DashboardSummary, ChangeLogEntry, AnalyticsDashboardResponse } from '../types';
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
  headers: {
    'Content-Type': 'application/json',
  },
});

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

client.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const [apiBaseUrl, token, deviceUuid, shopId] = await Promise.all([
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
}

interface ApiErrorBody {
  detail?: string | ValidationIssue[] | StructuredErrorDetail;
}

interface TokenResponse {
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

interface InvitationAcceptPayload extends LoginPayload {
  token: string;
  full_name: string;
}

let isRefreshing = false;
let failedQueue: RefreshQueueEntry[] = [];

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

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && originalRequest.url !== '/auth/login') {
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
          const refreshToken = await getRefreshToken();
          if (!refreshToken) {
            throw new Error('No refresh token available');
          }
          const apiBaseUrl = await getApiBaseUrl();
          const { data } = await axios.post<TokenResponse>(`${apiBaseUrl}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });
          await setAuthData(data.access_token, data.refresh_token, {
            full_name: data.full_name,
            user_id: data.user_id,
            email: data.email,
            memberships: data.memberships,
          });
          client.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          processQueue(undefined, data.access_token);
          return client(originalRequest);
        } catch (err) {
          processQueue(err);
          await clearAuthData();
          window.location.href = '/';
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

    const customError = new Error(errorMessage);
    return Promise.reject(customError);
  }
);

type SaleCreatePayload = Omit<Sale, 'id'> & {
  total_amount?: number;
};

export const apiClient = {
  // Auth
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
      name: string;
      slug: string;
      role: string;
    }>>('/shops');
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
  
  async logout() {
    try {
      await client.post('/auth/logout');
    } finally {
      await clearAuthData();
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
      plan: 'free' | 'pro';
      source: string;
      active_item_limit: number | null;
      active_item_count: number;
      can_add_item: boolean;
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

  async getItemForPOS(barcode: string) {
    const { data } = await client.get<ItemPOSWithPrice>(`/items/pos/scan/${barcode}`);
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
  async createSale(sale: SaleCreatePayload) {
    const { data } = await client.post<Sale>('/sales/', {
      invoice_no: sale.invoice_no,
      items: sale.items.map(item => ({ item_id: item.item_id, quantity: item.quantity })),
      customer_name: sale.customer_name,
      customer_phone: sale.customer_phone,
      customer_address: sale.customer_address,
      total_amount: sale.total_amount,
    }, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
    return data;
  },

  async getDashboardSummary() {
    const { data } = await client.get<DashboardSummary>('/dashboard/summary');
    return data;
  },

  async getDashboardAnalytics(from_date: string, to_date: string, metal: string) {
    const { data } = await client.get<AnalyticsDashboardResponse>('/dashboard/analytics', {
      params: { from_date, to_date, metal },
    });
    return data;
  },

  async getChangeLogHistory(params: {
    barcode?: string;
    invoice_no?: string;
    action?: string;
    from_date?: string;
    to_date?: string;
  }) {
    const { data } = await client.get<ChangeLogEntry[]>('/change-log/history', {
      params,
    });
    return data;
  },

  // Invoices
  async getInvoicePDF(saleId: string) {
    const response = await client.get(`/sales/${saleId}/invoice`, {
      responseType: 'arraybuffer',
    });
    return response.data;
  },
};

export default apiClient;
