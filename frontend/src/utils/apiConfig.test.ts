import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./storage', () => ({
  getPreference: vi.fn(),
  setPreference: vi.fn(),
}));

import { getPreference, setPreference } from './storage';
import { getApiBaseUrl, getSavedApiUrl, saveApiBaseUrl } from './apiConfig';

const mockedGetPreference = vi.mocked(getPreference);
const mockedSetPreference = vi.mocked(setPreference);

describe('local API URL configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('migrates the legacy saved localhost port to 8080', async () => {
    mockedGetPreference.mockResolvedValue('http://localhost:8000/');

    await expect(getSavedApiUrl()).resolves.toBe('http://localhost:8080');
    expect(mockedSetPreference).toHaveBeenCalledWith(
      'api_base_url',
      'http://localhost:8080',
    );
  });

  it('uses the configured local development backend by default', async () => {
    mockedGetPreference.mockResolvedValue(null);

    await expect(getApiBaseUrl()).resolves.toBe('http://localhost:8080');
  });

  it('normalizes a manually entered legacy local URL', async () => {
    await expect(saveApiBaseUrl('http://localhost:8000/')).resolves.toBe(
      'http://localhost:8080',
    );
  });
});
