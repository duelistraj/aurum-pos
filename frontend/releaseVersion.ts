import { readFileSync } from 'node:fs';

export const RELEASE_VERSION = readFileSync(
  new URL('../VERSION', import.meta.url),
  'utf8',
).trim();

if (!RELEASE_VERSION) {
  throw new Error('VERSION must contain the Aurum POS release version.');
}
