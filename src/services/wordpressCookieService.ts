import AsyncStorage from '@react-native-async-storage/async-storage';

import { AUTH_STORAGE_KEYS } from '../config/authConfig';
import { getSecureValue } from './secureTokenStorage';

type HeaderRecord = Record<string, string>;

let cachedCookieHeader: string | null | undefined;
let cachedWooCommerceAuthHeader: string | null | undefined;
let cachedBearerToken: string | null | undefined;

const normalizeHeaders = (headers?: HeadersInit): HeaderRecord => {
  if (!headers) {
    return {};
  }

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const record: HeaderRecord = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }

  if (Array.isArray(headers)) {
    return headers.reduce<HeaderRecord>((accumulator, [key, value]) => {
      accumulator[key] = value;
      return accumulator;
    }, {});
  }

  return { ...(headers as HeaderRecord) };
};

const hasAuthorizationHeader = (headers: HeaderRecord): boolean =>
  Object.keys(headers).some(key => key.toLowerCase() === 'authorization');

const getStoredWooCommerceAuthHeader = async (): Promise<string | null> => {
  if (typeof cachedWooCommerceAuthHeader !== 'undefined') {
    return cachedWooCommerceAuthHeader;
  }

  const stored = await AsyncStorage.getItem(
    AUTH_STORAGE_KEYS.woocommerceAuthHeader,
  );
  const trimmed = stored?.trim();
  cachedWooCommerceAuthHeader = trimmed && trimmed.length > 0 ? trimmed : null;

  return cachedWooCommerceAuthHeader;
};

const getStoredBearerToken = async (): Promise<string | null> => {
  if (typeof cachedBearerToken !== 'undefined') {
    return cachedBearerToken;
  }

  const secureToken = await getSecureValue(AUTH_STORAGE_KEYS.token);
  if (secureToken) {
    cachedBearerToken = secureToken;
    return cachedBearerToken;
  }

  const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.token);
  cachedBearerToken = stored && stored.trim().length > 0 ? stored.trim() : null;

  return cachedBearerToken;
};

const ensureAuthorizationHeader = async (
  headers: HeaderRecord,
): Promise<void> => {
  if (hasAuthorizationHeader(headers)) {
    return;
  }

  const bearerToken = await getStoredBearerToken();
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
    return;
  }

  const wooAuthHeader = await getStoredWooCommerceAuthHeader();
  if (wooAuthHeader) {
    headers.Authorization = wooAuthHeader;
  }
};

export const persistWooCommerceAuthHeader = async (
  header: string | null,
): Promise<void> => {
  const normalized = header && header.trim().length > 0 ? header : null;
  cachedWooCommerceAuthHeader = normalized;

  if (normalized) {
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEYS.woocommerceAuthHeader,
      normalized,
    );
  } else {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.woocommerceAuthHeader);
  }
};

const persistCookieHeader = async (header: string | null): Promise<void> => {
  const normalized = header && header.trim().length > 0 ? header : null;
  cachedCookieHeader = normalized;

  if (normalized) {
    await AsyncStorage.setItem(AUTH_STORAGE_KEYS.wordpressCookies, normalized);
  } else {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.wordpressCookies);
  }
};

export const buildWordPressRequestInit = async (
  init?: RequestInit,
): Promise<RequestInit> => {
  const headers = normalizeHeaders(init?.headers);

  await ensureAuthorizationHeader(headers);

  return {
    ...(init ?? {}),
    headers,
    credentials: init?.credentials ?? 'omit',
  };
};

export const syncWordPressCookiesFromResponse = async (
  _response: Response,
): Promise<void> => {
  if (typeof cachedCookieHeader === 'undefined' || cachedCookieHeader !== null) {
    await persistCookieHeader(null);
  }
};

export const clearStoredWordPressCookies = async (): Promise<void> => {
  cachedCookieHeader = null;
  await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.wordpressCookies);
};

// Exposed for tests to reset in-memory state without touching AsyncStorage directly.
export const __unsafeResetWordPressCookieCacheForTests = () => {
  cachedCookieHeader = undefined;
};

export const clearStoredWooCommerceAuthHeader = async (): Promise<void> => {
  cachedWooCommerceAuthHeader = null;
  await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.woocommerceAuthHeader);
};

export const __unsafeResetWooCommerceAuthHeaderCacheForTests = () => {
  cachedWooCommerceAuthHeader = undefined;
};

export const updateCachedBearerToken = (token: string | null): void => {
  cachedBearerToken = token && token.trim().length > 0 ? token.trim() : null;
};

export const clearCachedBearerToken = (): void => {
  cachedBearerToken = null;
};

export const __unsafeResetBearerTokenCacheForTests = () => {
  cachedBearerToken = undefined;
};
