export type AnalyticsColorMode = 'light' | 'dark';

export const ANALYTICS_CHART_TYPOGRAPHY = {
  supportingSize: 12,
  regularWeight: 600,
  strongWeight: 700,
} as const;

const METAL_COLOR_BY_MODE: Record<AnalyticsColorMode, Record<string, string>> = {
  light: {
    gold: '#D99A24',
    silver: '#87939F',
    platinum: '#607FA8',
  },
  dark: {
    gold: '#E8A62B',
    silver: '#AAB3BC',
    platinum: '#82A5D1',
  },
};

const CHART_COLORS_BY_MODE: Record<AnalyticsColorMode, readonly string[]> = {
  light: ['#7560AA', '#397F89', '#A86762', '#4C8B6B', '#9A5F82', '#4F6FA3'],
  dark: ['#937FC5', '#62A2AB', '#C77F78', '#74AE88', '#BC80A3', '#7899C4'],
};

const normalizeMetalLabel = (label: string): string =>
  label.trim().toLowerCase().replace(/\s+jewellery$/, '');

export const getChartColor = (
  index: number,
  mode: AnalyticsColorMode,
): string => {
  const palette = CHART_COLORS_BY_MODE[mode];
  return palette[((index % palette.length) + palette.length) % palette.length];
};

export const createBreakdownColorMap = (
  labels: readonly string[],
  options: {
    useMetalColors: boolean;
    mode: AnalyticsColorMode;
  },
): ReadonlyMap<string, string> => {
  const { useMetalColors, mode } = options;
  return new Map(labels.map((label, index) => [
    label,
    useMetalColors
      ? METAL_COLOR_BY_MODE[mode][normalizeMetalLabel(label)] ?? getChartColor(index, mode)
      : getChartColor(index, mode),
  ]));
};

export const selectEvenlySpacedTicks = <T>(values: readonly T[], maximum: number): T[] => {
  if (values.length <= maximum) return [...values];
  if (maximum <= 1) return values.length > 0 ? [values[0]] : [];
  return Array.from({ length: maximum }, (_, index) => (
    values[Math.round(index * (values.length - 1) / (maximum - 1))]
  ));
};

const trimTrailingZero = (value: string): string => value.replace(/\.0$/, '');

export const formatCompactCurrency = (value: number): string => {
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 10_000_000) return `₹${trimTrailingZero((value / 10_000_000).toFixed(1))}Cr`;
  if (absoluteValue >= 100_000) return `₹${trimTrailingZero((value / 100_000).toFixed(1))}L`;
  if (absoluteValue >= 1_000) return `₹${trimTrailingZero((value / 1_000).toFixed(1))}K`;
  return `₹${Math.round(value)}`;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const getHorizontalBarMargins = (
  categories: readonly string[],
  formattedValues: readonly string[],
) => ({
  top: 4,
  right: clamp(Math.max(0, ...formattedValues.map((value) => value.length)) * 7 + 20, 72, 132),
  bottom: 32,
  left: clamp(Math.max(0, ...categories.map((category) => category.length)) * 6 + 22, 104, 148),
});
