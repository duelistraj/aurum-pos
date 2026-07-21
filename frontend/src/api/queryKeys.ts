export const queryKeys = {
  dashboard: ['dashboard', 'summary'] as const,
  analytics: (fromDate: string, toDate: string, metal: string) =>
    ['dashboard', 'analytics', fromDate, toDate, metal] as const,
  items: (filters: object) => ['items', filters] as const,
  itemSummary: ['items', 'summary'] as const,
  latestItem: ['items', 'latest'] as const,
  metalRates: ['metal-rates'] as const,
  availableMetals: ['metal-rates', 'available'] as const,
  history: (filters: object) => ['change-log', filters] as const,
};
