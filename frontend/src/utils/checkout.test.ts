import { beforeEach, describe, expect, it, vi } from 'vitest';

const storedValues = new Map<string, string>();

vi.mock('./storage', () => ({
  getPreference: vi.fn(async (key: string) => storedValues.get(key) ?? null),
  setPreference: vi.fn(async (key: string, value: string) => {
    storedValues.set(key, value);
  }),
  removePreference: vi.fn(async (key: string) => {
    storedValues.delete(key);
  }),
}));

import {
  clearCheckoutIdempotencyKey,
  getCheckoutIdempotencyKey,
} from './checkout';

describe('checkout idempotency', () => {
  beforeEach(() => {
    storedValues.clear();
  });

  it('reuses the operation key for an ambiguous retry of the same checkout', async () => {
    const payload = {
      items: [{ item_id: 'item-1', quantity: 1 }],
      customer_name: 'Customer',
      customer_phone: '9999999999',
    };

    const first = await getCheckoutIdempotencyKey(payload);
    const retry = await getCheckoutIdempotencyKey(payload);

    expect(retry).toBe(first);
  });

  it('creates a new key for a different checkout and clears completed state', async () => {
    const first = await getCheckoutIdempotencyKey({ items: ['item-1'] });
    const second = await getCheckoutIdempotencyKey({ items: ['item-2'] });

    expect(second).not.toBe(first);
    await clearCheckoutIdempotencyKey();
    expect(storedValues.size).toBe(0);
  });
});
