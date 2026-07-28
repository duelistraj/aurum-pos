const LEGACY_LOCAL_API_URL = 'http://localhost:8000';
const LOCAL_API_URL = 'http://localhost:8080';
const BUILD_DEFAULT_API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '';
const CLOUD_API_URL = 'https://api.aurumpos.net';
export const isCloudDistribution = import.meta.env.VITE_DISTRIBUTION === 'cloud';

const normalizeApiUrl = (url: string): string => url.trim().replace(/\/+$/, '');
const migrateLegacyLocalApiUrl = (url: string): string =>
  url === LEGACY_LOCAL_API_URL ? LOCAL_API_URL : url;

export const getApiBaseUrl = async (): Promise<string> => {
  if (isCloudDistribution) return CLOUD_API_URL;
  return migrateLegacyLocalApiUrl(normalizeApiUrl(BUILD_DEFAULT_API_URL));
};

export const getRecoveryPageUrl = async (page: string): Promise<string> => {
  if (isCloudDistribution) {
    return `https://aurumpos.net/${page}`;
  }
  return `${await getApiBaseUrl()}/${page}`;
};
