import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  getPreference: vi.fn(),
  setPreference: vi.fn(),
}));

vi.mock('./storage', () => ({
  getPreference: storageMocks.getPreference,
  setPreference: storageMocks.setPreference,
}));

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

describe('local API URL configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('migrates the legacy saved localhost port to 8080', async () => {
    storageMocks.getPreference.mockResolvedValue('http://localhost:8000/');
    const { getSavedApiUrl } = await loadApiConfig();

    await expect(getSavedApiUrl()).resolves.toBe('http://localhost:8080');
    expect(storageMocks.setPreference).toHaveBeenCalledWith(
      'api_base_url',
      'http://localhost:8080',
    );
  });

  it('uses the configured local development backend by default', async () => {
    storageMocks.getPreference.mockResolvedValue(null);
    const { getApiBaseUrl } = await loadApiConfig({
      apiUrl: 'http://localhost:8080',
    });

    await expect(getApiBaseUrl()).resolves.toBe('http://localhost:8080');
  });

  it('requires runtime configuration when a self-hosted build has no default', async () => {
    storageMocks.getPreference.mockResolvedValue(null);
    const { getApiBaseUrl, hasConfiguredApiUrl } = await loadApiConfig();

    await expect(getApiBaseUrl()).resolves.toBe('');
    await expect(hasConfiguredApiUrl()).resolves.toBe(false);
  });

  it('uses the fixed cloud API and ignores saved self-hosted URLs', async () => {
    storageMocks.getPreference.mockResolvedValue('http://localhost:8080');
    const { getApiBaseUrl, hasConfiguredApiUrl } = await loadApiConfig({
      apiUrl: 'https://ignored.example.com',
      distribution: 'cloud',
    });

    await expect(getApiBaseUrl()).resolves.toBe('https://api.aurumpos.net');
    await expect(hasConfiguredApiUrl()).resolves.toBe(true);
    expect(storageMocks.getPreference).not.toHaveBeenCalled();
  });

  it('normalizes a manually entered legacy local URL', async () => {
    const { saveApiBaseUrl } = await loadApiConfig();

    await expect(saveApiBaseUrl('http://localhost:8000/')).resolves.toBe(
      'http://localhost:8080',
    );
  });
});
