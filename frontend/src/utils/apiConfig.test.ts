import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadApiConfig = async ({
  apiUrl = '',
  distribution = 'self_hosted',
}: {
  apiUrl?: string;
  distribution?: string;
} = {}) => {
  vi.stubEnv('VITE_API_URL', apiUrl);
  vi.stubEnv('VITE_DISTRIBUTION', distribution);
  vi.resetModules();
  return import('./apiConfig');
};

describe('build-time API URL configuration', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the configured self-hosted backend', async () => {
    const { getApiBaseUrl } = await loadApiConfig({
      apiUrl: 'http://localhost:8080',
    });

    await expect(getApiBaseUrl()).resolves.toBe('http://localhost:8080');
  });

  it('normalizes the legacy local development port', async () => {
    const { getApiBaseUrl } = await loadApiConfig({
      apiUrl: 'http://localhost:8000/',
    });

    await expect(getApiBaseUrl()).resolves.toBe('http://localhost:8080');
  });

  it('uses the fixed cloud API and ignores build-time alternate URLs', async () => {
    const { getApiBaseUrl } = await loadApiConfig({
      apiUrl: 'https://ignored.example.com',
      distribution: 'cloud',
    });

    await expect(getApiBaseUrl()).resolves.toBe('https://api.aurumpos.net');
  });
});
