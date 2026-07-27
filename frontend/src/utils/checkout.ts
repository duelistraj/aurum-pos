import { getPreference, removePreference, setPreference } from './storage';

const PENDING_CHECKOUT_KEY = 'aurum:v1:pending_checkout';

interface PendingCheckout {
  fingerprint: string;
  idempotencyKey: string;
}

const fingerprintPayload = async (payload: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};

export const getCheckoutIdempotencyKey = async (payload: unknown): Promise<string> => {
  const fingerprint = await fingerprintPayload(payload);
  const stored = await getPreference(PENDING_CHECKOUT_KEY);
  if (stored) {
    try {
      const pending = JSON.parse(stored) as PendingCheckout;
      if (pending.fingerprint === fingerprint && pending.idempotencyKey) {
        return pending.idempotencyKey;
      }
    } catch {
      // Replace malformed legacy state below.
    }
  }

  const idempotencyKey = crypto.randomUUID();
  await setPreference(
    PENDING_CHECKOUT_KEY,
    JSON.stringify({ fingerprint, idempotencyKey } satisfies PendingCheckout),
  );
  return idempotencyKey;
};

export const clearCheckoutIdempotencyKey = (): Promise<void> =>
  removePreference(PENDING_CHECKOUT_KEY);
