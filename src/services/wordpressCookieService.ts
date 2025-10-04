import AsyncStorage from '@react-native-async-storage/async-storage';

import { AUTH_STORAGE_KEYS } from '../config/authConfig';

type HeaderRecord = Record<string, string>;

const WORDPRESS_COOKIE_PATTERN = /(wordpress_[^=]+)=([^;]*)/gi;

let cachedCookieHeader: string | null | undefined;

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

const hasCookieHeader = (headers: HeaderRecord): boolean =>
  Object.keys(headers).some(key => key.toLowerCase() === 'cookie');

const parseCookieHeader = (header?: string | null): Map<string, string> => {
  const cookies = new Map<string, string>();

  if (!header) {
    return cookies;
  }

  header.split(';').forEach(part => {
    const trimmed = part.trim();
    if (!trimmed) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      return;
    }

    const name = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (name && value) {
      cookies.set(name, value);
    }
  });

  return cookies;
};

const formatCookieHeader = (cookies: Map<string, string>): string | null => {
  if (cookies.size === 0) {
    return null;
  }

  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
};

const getStoredCookieHeader = async (): Promise<string | null> => {
  if (typeof cachedCookieHeader !== 'undefined') {
    return cachedCookieHeader;
  }

  const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.wordpressCookies);
  cachedCookieHeader = stored && stored.trim().length > 0 ? stored : null;

  return cachedCookieHeader;
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

  if (!hasCookieHeader(headers)) {
    const storedHeader = await getStoredCookieHeader();
    if (storedHeader) {
      headers.Cookie = storedHeader;
    }
  }

  return {
    ...(init ?? {}),
    headers,
    credentials: init?.credentials ?? 'include',
  };
};

export const syncWordPressCookiesFromResponse = async (
  response: Response,
): Promise<void> => {
  if (!response || typeof response.headers?.get !== 'function') {
    return;
  }

  const setCookieHeader = response.headers.get('set-cookie');
  if (!setCookieHeader) {
    return;
  }

  const matches = Array.from(setCookieHeader.matchAll(WORDPRESS_COOKIE_PATTERN));
  if (matches.length === 0) {
    return;
  }

  const existingHeader = await getStoredCookieHeader();
  const cookies = parseCookieHeader(existingHeader);
  let hasChanges = false;

  for (const match of matches) {
    const name = match[1];
    const value = match[2];

    if (!value || value.toLowerCase() === 'deleted') {
      if (cookies.delete(name)) {
        hasChanges = true;
      }
    } else if (cookies.get(name) !== value) {
      cookies.set(name, value);
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    return;
  }

  const formatted = formatCookieHeader(cookies);
  await persistCookieHeader(formatted);
};

export const clearStoredWordPressCookies = async (): Promise<void> => {
  cachedCookieHeader = null;
  await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.wordpressCookies);
};

// Exposed for tests to reset in-memory state without touching AsyncStorage directly.
export const __unsafeResetWordPressCookieCacheForTests = () => {
  cachedCookieHeader = undefined;
};
