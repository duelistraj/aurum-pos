import { describe, expect, it } from 'vitest';

import { queryKeys } from './queryKeys';

describe('query keys', () => {
  it('separates analytics ranges and filters', () => {
    expect(queryKeys.analytics('from-a', 'to-a', 'all')).not.toEqual(
      queryKeys.analytics('from-b', 'to-b', 'silver'),
    );
  });

  it('uses stable resource prefixes for invalidation', () => {
    expect(queryKeys.dashboard[0]).toBe('dashboard');
    expect(queryKeys.metalRates[0]).toBe('metal-rates');
  });
});
