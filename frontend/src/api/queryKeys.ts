export const queryKeys = {
  entitlement: (shopId: string) => ['shops', shopId, 'entitlement'] as const,
  dashboard: (shopId: string) => ['shops', shopId, 'dashboard', 'summary'] as const,
  analytics: (shopId: string, fromDate: string, toDate: string, metal: string) =>
    ['shops', shopId, 'dashboard', 'analytics', fromDate, toDate, metal] as const,
  items: (shopId: string, filters: object) => ['shops', shopId, 'items', filters] as const,
  itemSummary: (shopId: string) => ['shops', shopId, 'items', 'summary'] as const,
  latestItem: (shopId: string) => ['shops', shopId, 'items', 'latest'] as const,
  metalRates: (shopId: string) => ['shops', shopId, 'metal-rates'] as const,
  availableMetals: (shopId: string) => ['shops', shopId, 'metal-rates', 'available'] as const,
  history: (shopId: string, filters: object) => ['shops', shopId, 'change-log', filters] as const,
  invoices: (shopId: string, filters: object) => ['shops', shopId, 'invoices', filters] as const,
};
