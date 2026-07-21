import { describe, expect, it } from 'vitest';

import { queryKeys } from './queryKeys';

describe('query keys', () => {
  it('separates analytics ranges and filters', () => {
    expect(queryKeys.analytics('shop-a', 'from-a', 'to-a', 'all')).not.toEqual(
      queryKeys.analytics('shop-a', 'from-b', 'to-b', 'silver'),
    );
  });

  it('uses stable resource prefixes for invalidation', () => {
    expect(queryKeys.dashboard('shop-a').slice(0, 2)).toEqual(['shops', 'shop-a']);
    expect(queryKeys.metalRates('shop-b').slice(0, 2)).toEqual(['shops', 'shop-b']);
  });
});
