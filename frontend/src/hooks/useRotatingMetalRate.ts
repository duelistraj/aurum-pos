import React from 'react';
import { DisplayMetalRate, sortMetalRates } from '../features/metalRates/display';

export const METAL_RATE_ROTATION_MS = 5_000;

export const useRotatingMetalRate = <T extends DisplayMetalRate>(
  rates: readonly T[],
): T | null => {
  const orderedRates = React.useMemo(() => sortMetalRates(rates), [rates]);
  const rateSignature = JSON.stringify(orderedRates);
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [rateSignature]);

  React.useEffect(() => {
    if (orderedRates.length < 2) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setActiveIndex((current) => (current + 1) % orderedRates.length);
    }, METAL_RATE_ROTATION_MS);
    return () => window.clearInterval(interval);
  }, [orderedRates.length, rateSignature]);

  return orderedRates[activeIndex % Math.max(orderedRates.length, 1)] ?? null;
};
