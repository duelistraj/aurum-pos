export const METAL_DISPLAY_ORDER = ['gold', 'silver', 'platinum'] as const;

export interface DisplayMetalRate {
  metal: string;
}

export const formatMetalName = (metal: string): string => {
  const normalized = metal.trim().toLowerCase();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Metal';
};

export const sortMetalRates = <T extends DisplayMetalRate>(rates: readonly T[]): T[] => {
  const orderByMetal = new Map<string, number>(
    METAL_DISPLAY_ORDER.map((metal, index) => [metal, index]),
  );
  return [...rates].sort((left, right) => {
    const leftName = left.metal.trim().toLowerCase();
    const rightName = right.metal.trim().toLowerCase();
    const leftOrder = orderByMetal.get(leftName) ?? METAL_DISPLAY_ORDER.length;
    const rightOrder = orderByMetal.get(rightName) ?? METAL_DISPLAY_ORDER.length;
    return leftOrder - rightOrder || leftName.localeCompare(rightName);
  });
};
