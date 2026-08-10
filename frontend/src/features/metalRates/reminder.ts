import { MetalRate } from '../../types';
import { getIndiaDateKey } from '../../utils/indiaTime';

export const getStaleConfiguredRates = (
  rates: readonly MetalRate[],
  now: Date,
): MetalRate[] => {
  const today = getIndiaDateKey(now);
  return rates.filter((rate) => {
    if (Number(rate.purity) !== 100) return false;
    if (!rate.effective_from) return true;
    const updatedAt = new Date(rate.effective_from);
    return Number.isNaN(updatedAt.getTime()) || getIndiaDateKey(updatedAt) !== today;
  });
};
