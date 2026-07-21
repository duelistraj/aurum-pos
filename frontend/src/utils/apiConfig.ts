import axios from 'axios';
import { getPreference, setPreference } from './storage';

const API_URL_KEY = 'api_base_url';
const BUILD_DEFAULT_API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '';

const normalizeApiUrl = (url: string): string => url.trim().replace(/\/+$/, '');

export const getSavedApiUrl = async (): Promise<string | null> => {
  const value = await getPreference(API_URL_KEY);
  return value ? normalizeApiUrl(value) : null;
};

export const getApiBaseUrl = async (): Promise<string> => {
  const savedUrl = await getSavedApiUrl();
  return savedUrl || normalizeApiUrl(BUILD_DEFAULT_API_URL);
};

export const saveApiBaseUrl = async (url: string): Promise<string> => {
  const normalizedUrl = normalizeApiUrl(url);
  await setPreference(API_URL_KEY, normalizedUrl);
  window.dispatchEvent(new CustomEvent('api-url-changed', { detail: normalizedUrl }));
  return normalizedUrl;
};

export const validateApiBaseUrl = async (url: string): Promise<void> => {
  const normalizedUrl = normalizeApiUrl(url);
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    throw new Error('Enter a full URL starting with http:// or https://.');
  }

  const response = await axios.get(`${normalizedUrl}/`, { timeout: 10_000 });
  if (response.status !== 200 || response.data?.status !== 'ok') {
    throw new Error('The server did not return a valid Aurum POS health response.');
  }
};

export const hasConfiguredApiUrl = async (): Promise<boolean> => Boolean(await getApiBaseUrl());
