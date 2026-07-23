import { registerPlugin } from '@capacitor/core';
import { PLAY_PRODUCT_ID } from '../constants/billing';

export { PLAY_PRODUCT_ID };

interface BillingOffer {
  basePlanId: string;
  offerToken: string;
  formattedPrice?: string;
  billingPeriod?: string;
}

interface BillingProduct {
  productId: string;
  title: string;
  description: string;
  offers: BillingOffer[];
}

interface PurchaseResult {
  purchaseToken: string;
  purchaseState: number;
  acknowledged: boolean;
}

interface AurumBillingPlugin {
  getProducts(options: { productId: string }): Promise<{ products: BillingProduct[] }>;
  purchase(options: {
    productId: string;
    basePlanId: string;
    obfuscatedAccountId: string;
    obfuscatedProfileId: string;
  }): Promise<PurchaseResult>;
  restore(): Promise<{ purchases: PurchaseResult[] }>;
}

export const AurumBilling = registerPlugin<AurumBillingPlugin>('AurumBilling');

export const sha256 = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
