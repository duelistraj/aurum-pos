import { Award, Disc, Gem, LayoutGrid, Settings, Sparkles } from 'lucide-react';

export const METAL_FILTER_OPTIONS = [
  { value: 'all', label: 'All Metals', icon: LayoutGrid },
  { value: 'silver', label: 'Silver', icon: Disc },
  { value: 'gold', label: 'Gold', icon: Sparkles },
  { value: 'platinum', label: 'Platinum', icon: Gem },
];

const PURITY_OPTIONS_BY_METAL: Record<
  string,
  Array<{ value: string; label: string }>
> = {
  silver: [
    { value: '99.9', label: '99.9%' },
    { value: '92.5', label: '92.5%' },
    { value: 'other', label: 'Other (Unspecified)' },
  ],
  gold: [
    { value: '99.9', label: '24K (99.9%)' },
    { value: '91.6', label: '22K (91.6%)' },
    { value: '75', label: '18K (75.0%)' },
    { value: '58.5', label: '14K (58.5%)' },
  ],
  platinum: [
    { value: '99.9', label: 'Pt999 (99.9%)' },
    { value: '95', label: 'Pt950 (95.0%)' },
    { value: '90', label: 'Pt900 (90.0%)' },
  ],
};

const DEFAULT_PURITY_BY_METAL: Record<string, string> = {
  silver: '92.5',
  gold: '91.6',
  platinum: '95',
};

const getConfiguredPurities = (
  metal: string,
  availableMetals: Record<string, number[]>,
) => Object.entries(availableMetals).find(
  ([name]) => name.toLowerCase() === metal.toLowerCase(),
)?.[1] ?? [];

export const getPurityOptions = (
  metal: string,
  availableMetals: Record<string, number[]>,
) => {
  const options = PURITY_OPTIONS_BY_METAL[metal.toLowerCase()] ?? [];
  const configured = getConfiguredPurities(metal, availableMetals);
  if (configured.length === 0 || configured.includes(100)) return options;
  return options.filter((option) => (
    option.value === 'other'
      ? configured.includes(0)
      : configured.includes(Number(option.value))
  ));
};

export const getDefaultPurity = (
  metal: string,
  availableMetals: Record<string, number[]>,
) => {
  const options = getPurityOptions(metal, availableMetals);
  return options.find(
    (option) => option.value === DEFAULT_PURITY_BY_METAL[metal.toLowerCase()],
  )?.value ?? options[0]?.value ?? 'other';
};

export const getCanonicalMetal = (
  metal: string,
  availableMetals: Record<string, number[]>,
) => Object.keys(availableMetals).find(
  (name) => name.toLowerCase() === metal.toLowerCase(),
) ?? metal;

export const getMetalIconBg = (metalName: string) => {
  const name = metalName.toLowerCase();
  if (name === 'gold') return { icon: Sparkles, bg: 'inventory-option-icon' };
  if (name === 'silver') return { icon: Disc, bg: 'inventory-option-icon' };
  return { icon: Gem, bg: 'inventory-option-icon' };
};

export const getPurityIconBg = (purityValue: string) => ({
  icon: purityValue === 'other' ? Settings : Award,
  bg: 'inventory-option-icon',
});
