import { registerPlugin } from '@capacitor/core';

interface AurumGoogleAuthPlugin {
  signIn(options: { serverClientId: string; nonce: string }): Promise<{ idToken: string }>;
}

export const AurumGoogleAuth = registerPlugin<AurumGoogleAuthPlugin>('AurumGoogleAuth');

export const createNonce = (): string => {
  const values = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(values).map((value) => value.toString(16).padStart(2, '0')).join('');
};
