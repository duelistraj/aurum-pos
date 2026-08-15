import {
  Award,
  Badge,
  Circle,
  CircleDashed,
  CircleDot,
  CircleDotDashed,
  Coins,
  Crown,
  Diamond,
  Disc,
  Ear,
  Eye,
  Flower2,
  Footprints,
  Gem,
  Landmark,
  LayoutGrid,
  Link2,
  MoreHorizontal,
  Orbit,
  Ribbon,
  Settings,
  Shapes,
  Sparkles,
  SquareStack,
  Watch,
  Waves,
} from 'lucide-react';

export const METAL_FILTER_OPTIONS = [
  { value: 'all', label: 'All Metals', icon: LayoutGrid, bg: 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400' },
  { value: 'silver', label: 'Silver', icon: Disc, bg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  { value: 'gold', label: 'Gold', icon: Coins, bg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' },
  { value: 'platinum', label: 'Platinum', icon: Diamond, bg: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300' },
  { value: 'stone', label: 'Stones', icon: Gem, bg: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300' },
];

export const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories', icon: LayoutGrid },
  { value: 'jewellery', label: 'Jewellery', icon: Sparkles },
  { value: 'jewellery-set', label: 'Jewellery Set', icon: Shapes },
  { value: 'unique', label: 'Unique', icon: Gem },
  { value: 'ring', label: 'Ring', icon: Circle },
  { value: 'earring', label: 'Earring', icon: Ear },
  { value: 'necklace', label: 'Necklace', icon: CircleDotDashed },
  { value: 'chain', label: 'Chain', icon: Link2 },
  { value: 'pendant', label: 'Pendant', icon: Diamond },
  { value: 'bracelet', label: 'Bracelet', icon: Watch },
  { value: 'bangle', label: 'Bangle', icon: Disc },
  { value: 'kada', label: 'Kada', icon: CircleDashed },
  { value: 'anklet', label: 'Anklet', icon: Footprints },
  { value: 'toe-ring', label: 'Toe Ring', icon: Footprints },
  { value: 'nose-pin', label: 'Nose Pin', icon: CircleDot },
  { value: 'nose-ring', label: 'Nose Ring', icon: Circle },
  { value: 'mangalsutra', label: 'Mangalsutra', icon: Orbit },
  { value: 'maang-tikka', label: 'Maang Tikka', icon: Crown },
  { value: 'armlet', label: 'Armlet', icon: Badge },
  { value: 'waist-belt', label: 'Waist Belt', icon: Ribbon },
  { value: 'brooch', label: 'Brooch', icon: Flower2 },
  { value: 'cufflinks', label: 'Cufflinks', icon: SquareStack },
  { value: 'coin', label: 'Coin', icon: Coins },
  { value: 'idol', label: 'Idol', icon: Landmark },
  { value: 'rakhi', label: 'Rakhi', icon: Ribbon },
  { value: 'manik', label: 'Manik', icon: Gem },
  { value: 'moti', label: 'Moti', icon: Circle },
  { value: 'moonga', label: 'Moonga', icon: Waves },
  { value: 'panna', label: 'Panna', icon: Gem },
  { value: 'pokhraj', label: 'Pokhraj', icon: Diamond },
  { value: 'heera', label: 'Heera', icon: Diamond },
  { value: 'neelam', label: 'Neelam', icon: Gem },
  { value: 'gomed', label: 'Gomed', icon: Gem },
  { value: 'lehsunia', label: 'Lehsunia', icon: Eye },
  { value: 'other', label: 'Other', icon: MoreHorizontal },
];

export const JEWELLERY_CATEGORIES = new Set([
  'jewellery', 'jewellery-set', 'unique', 'ring', 'earring', 'necklace',
  'chain', 'pendant', 'bracelet', 'bangle', 'kada', 'anklet', 'toe-ring',
  'nose-pin', 'nose-ring', 'mangalsutra', 'maang-tikka', 'armlet',
  'waist-belt', 'brooch', 'cufflinks', 'coin', 'idol', 'rakhi', 'other',
]);

export const STONE_CATEGORIES = new Set([
  'manik', 'moti', 'moonga', 'panna', 'pokhraj', 'heera', 'neelam', 'gomed',
  'lehsunia', 'other',
]);

export const INVENTORY_CATEGORY_FILTERS = new Set(
  CATEGORY_OPTIONS.map((option) => option.value),
);

export const normalizeCategory = (category: string) => {
  const normalized = category.trim().toLowerCase();
  return normalized === 'earrings' ? 'earring' : normalized;
};

export const getCategoryOption = (category: string) => {
  const normalized = normalizeCategory(category);
  const fallback = CATEGORY_OPTIONS[CATEGORY_OPTIONS.length - 1];
  return CATEGORY_OPTIONS.find((option) => option.value === normalized) ?? {
    ...fallback,
    value: normalized,
    label: normalized
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' '),
  };
};

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
  const option = METAL_FILTER_OPTIONS.find(
    ({ value }) => value === metalName.toLowerCase(),
  );
  return option ?? { icon: Gem, bg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
};

export const getPurityIconBg = (purityValue: string) => ({
  icon: purityValue === 'other' ? Settings : Award,
  bg: 'inventory-option-icon',
});
