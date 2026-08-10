import { describe, expect, it } from 'vitest';
import { getStaleConfiguredRates } from './reminder';

describe('getStaleConfiguredRates', () => {
  it('returns only configured rates not refreshed during the current IST day', () => {
    const now = new Date('2026-08-08T03:00:00.000Z');
    const stale = getStaleConfiguredRates([
      { metal: 'gold', purity: 100, rate_per_gram: 1, effective_from: '2026-08-07T18:29:59.000Z' },
      { metal: 'silver', purity: 100, rate_per_gram: 1, effective_from: '2026-08-07T18:30:00.000Z' },
      { metal: 'platinum', purity: 95, rate_per_gram: 1, effective_from: null },
    ], now);

    expect(stale.map(({ metal }) => metal)).toEqual(['gold']);
  });

  it('treats a configured rate with no usable timestamp as stale', () => {
    const now = new Date('2026-08-08T03:00:00.000Z');
    expect(getStaleConfiguredRates([
      { metal: 'silver', purity: 100, rate_per_gram: 1, effective_from: null },
    ], now)).toHaveLength(1);
  });
});
