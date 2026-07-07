import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Item, MetalRate, Sale, ItemPOSWithPrice, DashboardSummary, ChangeLogEntry, AnalyticsDashboardResponse } from '../types';
import { getAccessToken, getRefreshToken, setAuthData, clearAuthData } from '../utils/auth';
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
    config.baseURL = await getApiBaseUrl();
    const token = await getAccessToken();
    const deviceUuid = await getDeviceUUID();
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (deviceUuid) {
      config.headers['X-Device-UUID'] = deviceUuid;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
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
  (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/login') {
      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return client(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
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
          const { data } = await axios.post(`${apiBaseUrl}/auth/refresh`, { refresh_token: refreshToken });
          await setAuthData(data.access_token, data.refresh_token, {
            role: data.role,
            full_name: data.full_name,
            user_id: data.user_id,
          });
          client.defaults.headers.common['Authorization'] = 'Bearer ' + data.access_token;
          originalRequest.headers['Authorization'] = 'Bearer ' + data.access_token;
          processQueue(null, data.access_token);
          return client(originalRequest);
        } catch (err) {
          processQueue(err, null);
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
      const data = error.response.data as any;

      // Try to use the backend's detail message first
      if (data?.detail) {
        errorMessage = data.detail;
      }
      // For validation errors, construct a message from validation details
      else if (status === 422 && data?.detail && Array.isArray(data.detail)) {
        const validationErrors = data.detail.map((err: any) => {
          const field = err.loc?.[1] || 'field';
          const msg = err.msg || 'Invalid value';
          return `${field}: ${msg}`;
        }).join(', ');
        errorMessage = validationErrors || ERROR_MESSAGES[422];
      }
      // Use predefined message for known status codes
      else if (ERROR_MESSAGES[status]) {
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
  async login(payload: any) {
    const { data } = await client.post('/auth/login', payload);
    return data;
  },
  
  async logout() {
    try {
      await client.post('/auth/logout');
    } finally {
      await clearAuthData();
    }
  },

  async verifyManagerPassword(password: string) {
    const { data } = await client.post<{ valid: boolean }>('/auth/verify-manager-password', { password });
    return data;
  },

  // Health check
  async health() {
    const { data } = await client.get('/');
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
    const { data } = await client.get('/metal-rates');
    return data;
  },

  async addMetalRate(rate: MetalRate) {
    const { data } = await client.post('/metal-rates/', rate);
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
