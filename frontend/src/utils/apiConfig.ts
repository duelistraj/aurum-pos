import axios from 'axios';
import { getPreference, setPreference } from './storage';

const API_URL_KEY = 'api_base_url';
const LEGACY_LOCAL_API_URL = 'http://localhost:8000';
const LOCAL_API_URL = 'http://localhost:8080';
const BUILD_DEFAULT_API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '';

const normalizeApiUrl = (url: string): string => url.trim().replace(/\/+$/, '');
const migrateLegacyLocalApiUrl = (url: string): string =>
  url === LEGACY_LOCAL_API_URL ? LOCAL_API_URL : url;

export const getSavedApiUrl = async (): Promise<string | null> => {
  const value = await getPreference(API_URL_KEY);
  if (!value) return null;

  const normalizedUrl = normalizeApiUrl(value);
  const migratedUrl = migrateLegacyLocalApiUrl(normalizedUrl);
  if (migratedUrl !== normalizedUrl) {
    await setPreference(API_URL_KEY, migratedUrl);
  }
  return migratedUrl;
};

export const getApiBaseUrl = async (): Promise<string> => {
  const savedUrl = await getSavedApiUrl();
  return savedUrl || migrateLegacyLocalApiUrl(normalizeApiUrl(BUILD_DEFAULT_API_URL));
};

export const saveApiBaseUrl = async (url: string): Promise<string> => {
  const normalizedUrl = migrateLegacyLocalApiUrl(normalizeApiUrl(url));
  await setPreference(API_URL_KEY, normalizedUrl);
  window.dispatchEvent(new CustomEvent('api-url-changed', { detail: normalizedUrl }));
  return normalizedUrl;
};

export const validateApiBaseUrl = async (url: string): Promise<void> => {
  const normalizedUrl = migrateLegacyLocalApiUrl(normalizeApiUrl(url));
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    throw new Error('Enter a full URL starting with http:// or https://.');
  }

  const response = await axios.get(`${normalizedUrl}/`, { timeout: 10_000 });
  if (response.status !== 200 || response.data?.status !== 'ok') {
    throw new Error('The server did not return a valid Aurum POS health response.');
  }
};

export const hasConfiguredApiUrl = async (): Promise<boolean> => Boolean(await getApiBaseUrl());
