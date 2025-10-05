import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_STORAGE_KEYS, WORDPRESS_CONFIG } from '../config/authConfig';
import deviceLog from '../utils/deviceLog';
import {
  buildWordPressRequestInit,
  clearCachedBearerToken,
  clearStoredWordPressCookies,
  clearStoredWooCommerceAuthHeader,
  persistWooCommerceAuthHeader,
  updateCachedBearerToken,
  syncWordPressCookiesFromResponse,
} from './wordpressCookieService';
import {
  AuthUser,
  LoginOptions,
  MembershipBenefit,
  MembershipInfo,
  RegisterOptions,
  WooCommerceCredentialBundle,
} from '../types/auth';

export interface PersistedSession {
  token?: string;
  refreshToken?: string;
  tokenLoginUrl?: string | null;
  restNonce?: string | null;
  user: AuthUser | null;
  locked: boolean;
}

interface GnPasswordLoginUserPayload {
  id?: number | string;
  login?: string;
  email?: string;
  nicename?: string;
  display?: string;
  woocommerce?: GnPasswordLoginWooCommercePayload | null;
}

interface GnPasswordLoginResponse {
  success?: boolean;
  mode?: 'token' | 'cookie';
  message?: string;
  api_token?: string;
  token?: string;
  token_expires_in?: number;
  token_login_url?: string;
  rest_nonce?: string;
  nonce?: string;
  user?: GnPasswordLoginUserPayload | null;
  code?: string;
  data?: { status?: number };
  woocommerce?: GnPasswordLoginWooCommercePayload | null;
}

interface GnPasswordLoginWooCommercePayload {
  consumer_key?: unknown;
  consumer_secret?: unknown;
  basic_auth?: unknown;
  basic_auth_header?: unknown;
  basic_authentication?: unknown;
  basic_authorization?: unknown;
  basic_authorization_header?: unknown;
  basicAuthorization?: unknown;
  basicAuthorizationHeader?: unknown;
  authorization?: unknown;
  auth_header?: unknown;
}

const maskTokenForLogging = (token?: string | null): string | null => {
  if (!token) {
    return null;
  }

  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const lastFour = trimmed.slice(-4);
  return `***${lastFour} (length=${trimmed.length})`;
};

const describeUrlForLogging = (
  value?: string | null,
): { host?: string; pathname?: string; hasQuery?: boolean; length?: number } | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return {
      host: parsed.host,
      pathname: parsed.pathname,
      hasQuery: parsed.search.length > 0,
    };
  } catch (error) {
    return { length: trimmed.length };
  }
};

const isLikelyUrl = (value: string): boolean => {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch (error) {
    return false;
  }
};

const isLikelyLoginLinkToken = (value: string): boolean =>
  /^[a-zA-Z0-9]{48}$/.test(value);

const normalizeApiToken = (
  value?: string | null,
): string | undefined => {
  if (!value || typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (isLikelyUrl(trimmed) || isLikelyLoginLinkToken(trimmed)) {
    return undefined;
  }

  return trimmed;
};

const describeSessionForLogging = (
  session?: PersistedSession | null,
):
  | {
      hasToken: boolean;
      maskedToken: string | null;
      hasRefreshToken: boolean;
      maskedRefreshToken: string | null;
      tokenLoginUrl: ReturnType<typeof describeUrlForLogging>;
      locked: boolean;
      hasUser: boolean;
    }
  | null => {
  if (!session) {
    return null;
  }

  return {
    hasToken: Boolean(session.token),
    maskedToken: maskTokenForLogging(session.token),
    hasRefreshToken: Boolean(session.refreshToken),
    maskedRefreshToken: maskTokenForLogging(session.refreshToken),
    tokenLoginUrl: describeUrlForLogging(session.tokenLoginUrl ?? null),
    locked: session.locked,
    hasUser: Boolean(session.user),
  };
};

let lastRestoreSessionLogSummary: string | null = null;

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.replace(/\/+$/, '');

const ensureLeadingSlash = (path: string): string =>
  path.startsWith('/') ? path : `/${path}`;

const buildUrl = (path: string) =>
  `${normalizeBaseUrl(WORDPRESS_CONFIG.baseUrl)}${ensureLeadingSlash(path)}`;

const buildRestRouteUrl = (path: string) => {
  const normalizedPath = ensureLeadingSlash(path);
  const restRoute = normalizedPath.startsWith('/wp-json')
    ? normalizedPath.slice('/wp-json'.length) || '/'
    : normalizedPath;

  return `${normalizeBaseUrl(
    WORDPRESS_CONFIG.baseUrl,
  )}/?rest_route=${restRoute}`;
};

const isWooCommerceRestPath = (path: string): boolean => {
  const normalizedPath = ensureLeadingSlash(path);
  return normalizedPath.startsWith('/wp-json/wc/');
};

const appendWooCommerceCredentialsIfNeeded = (
  url: string,
  path: string,
): string => {
  if (!isWooCommerceRestPath(path)) {
    return url;
  }

  const consumerKey = WORDPRESS_CONFIG.woocommerce.consumerKey.trim();
  const consumerSecret = WORDPRESS_CONFIG.woocommerce.consumerSecret.trim();

  if (!consumerKey || !consumerSecret) {
    return url;
  }

  try {
    const parsed = new URL(url);

    if (!parsed.searchParams.has('consumer_key')) {
      parsed.searchParams.append('consumer_key', consumerKey);
    }

    if (!parsed.searchParams.has('consumer_secret')) {
      parsed.searchParams.append('consumer_secret', consumerSecret);
    }

    return parsed.toString();
  } catch (error) {
    const params: string[] = [];

    if (!url.includes('consumer_key=')) {
      params.push(`consumer_key=${encodeURIComponent(consumerKey)}`);
    }

    if (!url.includes('consumer_secret=')) {
      params.push(`consumer_secret=${encodeURIComponent(consumerSecret)}`);
    }

    if (params.length === 0) {
      return url;
    }

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${params.join('&')}`;
  }
};

const decodeNumericEntities = (value: string): string =>
  value.replace(/&#(x?[0-9a-fA-F]+);/g, (match, entity) => {
    const isHexEntity =
      entity.length > 0 && (entity[0] === 'x' || entity[0] === 'X');
    const numericPortion = isHexEntity ? entity.slice(1) : entity;
    const codePoint = Number.parseInt(numericPortion, isHexEntity ? 16 : 10);

    if (!Number.isFinite(codePoint) || Number.isNaN(codePoint)) {
      return match;
    }

    try {
      return String.fromCodePoint(codePoint);
    } catch (error) {
      return match;
    }
  });

const decodeBasicHtmlEntities = (value: string): string => {
  const decoded = decodeNumericEntities(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  return decoded;
};

const sanitizeErrorMessage = (value: string): string => {
  const withoutTags = value.replace(/<[^>]*>/g, ' ');
  const decoded = decodeBasicHtmlEntities(withoutTags);
  const normalized = decoded.replace(/\s+/g, ' ').trim();

  return normalized.length > 0
    ? normalized
    : 'Unable to log in with WordPress credentials.';
};

const parseJsonResponse = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.clone().json()) as T;
  } catch (error) {
    return null;
  }
};

const parseTextResponse = async (
  response: Response,
): Promise<string | null> => {
  try {
    const text = await response.clone().text();
    return text && text.trim().length > 0 ? sanitizeErrorMessage(text) : null;
  } catch (error) {
    return null;
  }
};

const extractMessageFromResponse = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  const json = await parseJsonResponse<Record<string, unknown> | null>(
    response,
  );
  const messageSource =
    (json &&
      typeof json === 'object' &&
      typeof json.message === 'string' &&
      json.message) ||
    (json &&
      typeof json === 'object' &&
      typeof json.error === 'string' &&
      json.error) ||
    null;

  if (messageSource) {
    return sanitizeErrorMessage(messageSource);
  }

  const text = await parseTextResponse(response);
  if (text) {
    return text;
  }

  return fallback;
};

const extractSuccessFlag = (
  payload: Record<string, unknown> | null | undefined,
): boolean | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  if ('success' in payload) {
    const raw = payload.success;
    if (typeof raw === 'boolean') {
      return raw;
    }

    if (typeof raw === 'number') {
      if (raw === 1) {
        return true;
      }
      if (raw === 0) {
        return false;
      }
    }

    if (typeof raw === 'string') {
      const normalized = raw.toLowerCase();
      if (['true', '1', 'ok', 'yes', 'success'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'error', 'failed'].includes(normalized)) {
        return false;
      }
    }
  }

  if ('status' in payload) {
    const raw = payload.status;
    if (typeof raw === 'boolean') {
      return raw;
    }

    if (typeof raw === 'number') {
      if (raw >= 200 && raw < 400) {
        return true;
      }
      if (raw >= 400) {
        return false;
      }
    }

    if (typeof raw === 'string') {
      const normalized = raw.toLowerCase();
      if (['success', 'ok', 'completed', 'valid'].includes(normalized)) {
        return true;
      }
      if (['error', 'failed', 'fail', 'invalid'].includes(normalized)) {
        return false;
      }
    }
  }

  if ('data' in payload) {
    const raw = payload.data;
    if (raw && typeof raw === 'object') {
      const nested = extractSuccessFlag(raw as Record<string, unknown>);
      if (typeof nested === 'boolean') {
        return nested;
      }
    }
  }

  return undefined;
};

const fetchWithRouteFallback = async (
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  const primaryRequestInit = await buildWordPressRequestInit(init);
  const primaryUrl = appendWooCommerceCredentialsIfNeeded(buildUrl(path), path);
  const primaryResponse = await fetch(primaryUrl, primaryRequestInit);
  await syncWordPressCookiesFromResponse(primaryResponse);

  if (primaryResponse.status !== 404) {
    return primaryResponse;
  }

  let shouldFallback = false;
  try {
    const payload = await primaryResponse.clone().json();
    shouldFallback =
      payload &&
      typeof payload === 'object' &&
      'code' in payload &&
      payload.code === 'rest_no_route';
  } catch (error) {
    shouldFallback = false;
  }

  if (!shouldFallback) {
    return primaryResponse;
  }

  const fallbackRequestInit = await buildWordPressRequestInit(init);
  const fallbackUrl = appendWooCommerceCredentialsIfNeeded(
    buildRestRouteUrl(path),
    path,
  );
  const fallbackResponse = await fetch(fallbackUrl, fallbackRequestInit);
  await syncWordPressCookiesFromResponse(fallbackResponse);
  return fallbackResponse;
};

const hydrateWordPressCookieSession = async (
  tokenLoginUrl?: string | null,
  token?: string,
): Promise<{ status: number; ok: boolean }> => {
  const resolvedUrl =
    typeof tokenLoginUrl === 'string' ? tokenLoginUrl.trim() : '';

  if (!resolvedUrl) {
    deviceLog.debug('wordpressAuth.cookie.hydrate.skip', {
      reason: 'missing_token_login_url',
      hasToken: Boolean(token),
    });
    return { status: 0, ok: false };
  }

  const headers: Record<string, string> | undefined = token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : undefined;

  try {
    deviceLog.info('wordpressAuth.cookie.hydrate.start', {
      tokenLoginUrl: describeUrlForLogging(resolvedUrl),
      hasToken: Boolean(token),
      maskedToken: maskTokenForLogging(token),
    });
    const requestInit = await buildWordPressRequestInit({
      method: 'GET',
      headers,
    });
    const response = await fetch(resolvedUrl, requestInit);
    await syncWordPressCookiesFromResponse(response);
    deviceLog.debug('wordpressAuth.cookie.hydrate.response', {
      status: response.status,
      ok: response.ok,
    });
    return { status: response.status, ok: response.ok };
  } catch (error) {
    deviceLog.warn('wordpressAuth.cookie.hydrate.error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: 0, ok: false };
  }
};

export const ensureCookieSession = async (
  session?: PersistedSession | null,
): Promise<{ status: number; ok: boolean }> => {
  if (!session) {
    deviceLog.debug('wordpressAuth.cookie.ensure.skip', {
      reason: 'missing_session',
    });
    return { status: 0, ok: false };
  }

  deviceLog.info('wordpressAuth.cookie.ensure.start', {
    session: describeSessionForLogging(session),
  });
  const result = await hydrateWordPressCookieSession(
    session.tokenLoginUrl,
    session.token,
  );
  deviceLog.debug('wordpressAuth.cookie.ensure.result', {
    status: result.status,
    ok: result.ok,
  });
  return result;
};

const getString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
};

const encodeBase64 = (value: string): string | null => {
  try {
    if (typeof globalThis !== 'undefined') {
      const scope = globalThis as {
        btoa?: (input: string) => string;
        Buffer?: {
          from: (input: string, encoding?: string) => {
            toString: (encoding: string) => string;
          };
        };
      };

      if (typeof scope.btoa === 'function') {
        return scope.btoa(value);
      }

      const maybeBuffer = scope.Buffer;
      if (maybeBuffer && typeof maybeBuffer.from === 'function') {
        return maybeBuffer.from(value, 'utf8').toString('base64');
      }
    }
  } catch (error) {
    return null;
  }

  return null;
};

const normalizeBasicAuthorizationHeader = (
  header?: string | null,
): string | null => {
  if (!header || typeof header !== 'string') {
    return null;
  }

  const trimmed = header.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.toLowerCase().startsWith('basic ')
    ? trimmed
    : `Basic ${trimmed}`;
};

const createWooCommerceCredentialBundle = (
  consumerKey: string,
  consumerSecret: string,
  basicAuthorizationHeader?: string | null,
): WooCommerceCredentialBundle | null => {
  const trimmedKey = consumerKey.trim();
  const trimmedSecret = consumerSecret.trim();

  if (!trimmedKey || !trimmedSecret) {
    return null;
  }

  const normalizedHeader =
    normalizeBasicAuthorizationHeader(basicAuthorizationHeader) ||
    (() => {
      const encoded = encodeBase64(`${trimmedKey}:${trimmedSecret}`);
      return encoded ? `Basic ${encoded}` : null;
    })();

  return {
    consumerKey: trimmedKey,
    consumerSecret: trimmedSecret,
    basicAuthorizationHeader: normalizedHeader ?? undefined,
  };
};

const parseWooCommerceCredentialBundle = (
  source: unknown,
): WooCommerceCredentialBundle | null => {
  if (!source || typeof source !== 'object') {
    return null;
  }

  const record = source as Record<string, unknown>;
  const consumerKey =
    getString(record.consumer_key) ??
    getString(record.consumerKey) ??
    getString(record.key) ??
    null;
  const consumerSecret =
    getString(record.consumer_secret) ??
    getString(record.consumerSecret) ??
    getString(record.secret) ??
    null;
  const basicAuth =
    getString(record.basic_auth) ??
    getString(record.basicAuth) ??
    getString(record.basic_auth_header) ??
    getString(record.basicAuthHeader) ??
    getString(record.basic_authentication) ??
    getString(record.basicAuthorization) ??
    getString(record.basicAuthorizationHeader) ??
    getString(record.basic_authorization) ??
    getString(record.basic_authorization_header) ??
    getString(record.authorization) ??
    getString(record.auth_header) ??
    null;

  if (!consumerKey || !consumerSecret) {
    return null;
  }

  return createWooCommerceCredentialBundle(
    consumerKey,
    consumerSecret,
    basicAuth,
  );
};

const parseProfileUserPayload = (
  payload: Record<string, unknown>,
): AuthUser => {
  const membership = parseMembershipInfo(payload);

  const idSource = payload.id ?? (payload.ID as unknown);
  const parsedId =
    typeof idSource === 'number'
      ? idSource
      : typeof idSource === 'string'
      ? Number.parseInt(idSource, 10)
      : Number.NaN;

  const emailSource = payload.email ?? payload.user_email ?? '';
  const resolvedEmail =
    typeof emailSource === 'string'
      ? emailSource
      : String(emailSource ?? '');

  const nameSource =
    payload.name ?? payload.user_display_name ?? payload.username ?? resolvedEmail;
  const resolvedName =
    typeof nameSource === 'string' && nameSource.trim().length > 0
      ? nameSource
      : resolvedEmail;

  const meta = (payload.meta as Record<string, unknown> | undefined) ?? undefined;
  const firstNameSource =
    payload.first_name ??
    payload.firstName ??
    meta?.first_name ??
    meta?.firstName ??
    payload.meta_first_name ??
    undefined;
  const lastNameSource =
    payload.last_name ??
    payload.lastName ??
    meta?.last_name ??
    meta?.lastName ??
    payload.meta_last_name ??
    undefined;

  const avatarUrls = payload.avatar_urls as
    | Record<string, string>
    | undefined;

  return {
    id: Number.isFinite(parsedId) ? parsedId : -1,
    email: resolvedEmail,
    name: resolvedName,
    firstName: getString(firstNameSource),
    lastName: getString(lastNameSource),
    avatarUrl: avatarUrls?.['96'] ?? avatarUrls?.['48'],
    membership,
  };
};

type SessionValidationResult = {
  user: AuthUser | null;
  status: number;
};

const fetchSessionUser = async (
  token: string,
): Promise<SessionValidationResult> => {
  const normalizedToken = normalizeApiToken(token);

  if (!normalizedToken) {
    deviceLog.debug('wordpressAuth.fetchSessionUser.skip', {
      reason: 'invalid_token',
    });
    return { user: null, status: 0 };
  }

  deviceLog.info('wordpressAuth.fetchSessionUser.start', {
    maskedToken: maskTokenForLogging(normalizedToken),
  });

  try {
    const response = await fetchWithRouteFallback(
      WORDPRESS_CONFIG.endpoints.profile,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${normalizedToken}`,
          Accept: 'application/json',
        },
      },
    );

    deviceLog.debug('wordpressAuth.fetchSessionUser.response', {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      return { user: null, status: response.status };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return { user: parseProfileUserPayload(payload), status: response.status };
  } catch (error) {
    deviceLog.warn('wordpressAuth.fetchSessionUser.error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return { user: null, status: 0 };
  }
};

const parseDiscountValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const numeric = Number.parseFloat(value.replace(/%/g, ''));
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  return undefined;
};

const parseMembershipBenefits = (value: unknown): MembershipBenefit[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map<MembershipBenefit | null>((benefit, index) => {
      if (!benefit || typeof benefit !== 'object') {
        return null;
      }

      const raw = benefit as Record<string, unknown>;
      const title = raw.title ?? raw.name ?? raw.label;
      if (typeof title !== 'string' || title.trim().length === 0) {
        return null;
      }

      const description =
        raw.description ?? raw.summary ?? raw.details ?? raw.text;
      const discount =
        parseDiscountValue(raw.discountPercentage) ??
        parseDiscountValue(raw.discount) ??
        parseDiscountValue(raw.percent);

      const idValue = raw.id ?? raw.slug ?? raw.key ?? index;

      return {
        id: typeof idValue === 'string' ? idValue : String(idValue),
        title,
        description: typeof description === 'string' ? description : undefined,
        discountPercentage: discount,
      };
    })
    .filter((benefit): benefit is MembershipBenefit => Boolean(benefit));
};

const parseMembershipInfo = (
  payload: Record<string, unknown> | null | undefined,
): MembershipInfo | null => {
  if (!payload) {
    return null;
  }

  const meta =
    (payload.meta as Record<string, unknown> | undefined) ?? undefined;
  const membershipSource =
    (payload.membership as Record<string, unknown> | undefined) ??
    (meta?.membership as Record<string, unknown> | undefined) ??
    (meta?.membership_info as Record<string, unknown> | undefined) ??
    undefined;

  const tierValue =
    membershipSource?.tier ??
    membershipSource?.level ??
    meta?.membership_tier ??
    payload.membership_tier ??
    null;

  const expiryValue =
    membershipSource?.expiresAt ??
    membershipSource?.expires_at ??
    membershipSource?.expiry ??
    meta?.membership_expiry ??
    payload.membership_expiry ??
    null;

  const benefitsSource =
    membershipSource?.benefits ??
    meta?.membership_benefits ??
    payload.membership_benefits ??
    [];

  const benefits = parseMembershipBenefits(benefitsSource);

  if (tierValue == null && expiryValue == null && benefits.length === 0) {
    return null;
  }

  return {
    tier:
      typeof tierValue === 'string'
        ? tierValue
        : tierValue != null
        ? String(tierValue)
        : '',
    expiresAt:
      typeof expiryValue === 'string'
        ? expiryValue
        : expiryValue != null
        ? String(expiryValue)
        : null,
    benefits,
  };
};

const fetchUserProfile = async (token: string): Promise<AuthUser | null> => {
  try {
    const result = await fetchSessionUser(token);
    return result.user;
  } catch (error) {
    return null;
  }
};

export const setSessionLock = async (locked: boolean) => {
  if (locked) {
    await AsyncStorage.setItem(AUTH_STORAGE_KEYS.sessionLock, 'locked');
  } else {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.sessionLock);
  }
};

export const markPasswordAuthenticated = async () => {
  await AsyncStorage.setItem(AUTH_STORAGE_KEYS.passwordAuthenticated, 'true');
};

export const clearPasswordAuthenticated = async () => {
  await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.passwordAuthenticated);
};

export const hasPasswordAuthenticated = async (): Promise<boolean> => {
  const value = await AsyncStorage.getItem(
    AUTH_STORAGE_KEYS.passwordAuthenticated,
  );
  return value === 'true';
};

const storeSession = async ({
  token,
  refreshToken,
  tokenLoginUrl,
  restNonce,
  user,
}: Omit<PersistedSession, 'locked'>) => {
  const entries: [string, string][] = [];
  const removals: string[] = [];

  const normalizedToken = normalizeApiToken(token);

  if (normalizedToken) {
    entries.push([AUTH_STORAGE_KEYS.token, normalizedToken]);
  } else {
    removals.push(AUTH_STORAGE_KEYS.token);
  }

  if (refreshToken) {
    entries.push([AUTH_STORAGE_KEYS.refreshToken, refreshToken]);
  } else {
    removals.push(AUTH_STORAGE_KEYS.refreshToken);
  }

  if (user) {
    entries.push([AUTH_STORAGE_KEYS.userProfile, JSON.stringify(user)]);
  } else {
    removals.push(AUTH_STORAGE_KEYS.userProfile);
  }

  if (tokenLoginUrl) {
    entries.push([AUTH_STORAGE_KEYS.tokenLoginUrl, tokenLoginUrl]);
  } else {
    removals.push(AUTH_STORAGE_KEYS.tokenLoginUrl);
  }

  if (restNonce) {
    entries.push([AUTH_STORAGE_KEYS.wpRestNonce, restNonce]);
  } else {
    removals.push(AUTH_STORAGE_KEYS.wpRestNonce);
  }

  updateCachedBearerToken(normalizedToken ?? null);

  if (entries.length > 0) {
    await AsyncStorage.multiSet(entries);
  }

  if (removals.length > 0) {
    await AsyncStorage.multiRemove(removals);
  }

  const wooAuthHeader = user?.woocommerceCredentials
    ? (
        user.woocommerceCredentials.basicAuthorizationHeader ??
        createWooCommerceCredentialBundle(
          user.woocommerceCredentials.consumerKey,
          user.woocommerceCredentials.consumerSecret,
          user.woocommerceCredentials.basicAuthorizationHeader ?? null,
        )?.basicAuthorizationHeader ??
        null
      )
    : null;

  await persistWooCommerceAuthHeader(wooAuthHeader);

  await setSessionLock(false);
};

export const persistSessionSnapshot = async (
  session: PersistedSession | null,
): Promise<void> => {
  if (!session) {
    return;
  }

  await storeSession({
    token: session.token,
    refreshToken: session.refreshToken,
    tokenLoginUrl: undefined,
    restNonce: session.restNonce ?? undefined,
    user: session.user,
  });

  if (session.locked) {
    await setSessionLock(true);
  }
};

export const clearSession = async () => {
  await AsyncStorage.multiRemove([
    AUTH_STORAGE_KEYS.token,
    AUTH_STORAGE_KEYS.refreshToken,
    AUTH_STORAGE_KEYS.userProfile,
    AUTH_STORAGE_KEYS.sessionLock,
    AUTH_STORAGE_KEYS.passwordAuthenticated,
    AUTH_STORAGE_KEYS.tokenLoginUrl,
    AUTH_STORAGE_KEYS.wpRestNonce,
  ]);
  clearCachedBearerToken();
  await clearStoredWordPressCookies();
  await clearStoredWooCommerceAuthHeader();
  lastRestoreSessionLogSummary = null;
};

export const restoreSession = async (): Promise<PersistedSession | null> => {
  const [
    [, storedToken],
    [, storedRefreshToken],
    [, userJson],
    [, lockValue],
    [, _storedTokenLoginUrl],
    [, storedRestNonce],
  ] = await AsyncStorage.multiGet([
    AUTH_STORAGE_KEYS.token,
    AUTH_STORAGE_KEYS.refreshToken,
    AUTH_STORAGE_KEYS.userProfile,
    AUTH_STORAGE_KEYS.sessionLock,
    AUTH_STORAGE_KEYS.tokenLoginUrl,
    AUTH_STORAGE_KEYS.wpRestNonce,
  ]);

  if (_storedTokenLoginUrl && _storedTokenLoginUrl.length > 0) {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.tokenLoginUrl);
  }

  const rawToken = storedToken && storedToken.length > 0 ? storedToken : undefined;
  const token = normalizeApiToken(rawToken);
  if (rawToken && !token) {
    deviceLog.debug('wordpressAuth.restoreSession.ignoredToken', {
      length: rawToken.length,
    });
  }
  const refreshToken =
    storedRefreshToken && storedRefreshToken.length > 0
      ? storedRefreshToken
      : undefined;

  if (!token && !userJson) {
    deviceLog.debug('wordpressAuth.restoreSession.empty');
    lastRestoreSessionLogSummary = null;
    return null;
  }

  let user: AuthUser | null = null;

  if (userJson) {
    try {
      user = JSON.parse(userJson) as AuthUser;
    } catch (error) {
      deviceLog.warn('wordpressAuth.restoreSession.userParseError', {
        message: error instanceof Error ? error.message : String(error),
      });
      user = null;
    }
  }

  const session: PersistedSession = {
    token,
    refreshToken,
    tokenLoginUrl: undefined,
    restNonce:
      storedRestNonce && storedRestNonce.length > 0
        ? storedRestNonce
        : undefined,
    user,
    locked: lockValue === 'locked',
  };
  const sessionSummary = describeSessionForLogging(session);
  const serializedSessionSummary = JSON.stringify(sessionSummary);
  if (serializedSessionSummary !== lastRestoreSessionLogSummary) {
    lastRestoreSessionLogSummary = serializedSessionSummary;
    deviceLog.debug('wordpressAuth.restoreSession.success', {
      session: sessionSummary,
    });
  }
  return session;
};

export const refreshPersistedUserProfile = async (
  token?: string | null,
): Promise<AuthUser | null> => {
  deviceLog.info('wordpressAuth.refreshPersistedUserProfile.start', {
    hasToken: Boolean(token),
    maskedToken: maskTokenForLogging(token),
  });
  if (!token) {
    deviceLog.warn('wordpressAuth.refreshPersistedUserProfile.missingToken');
    return null;
  }

  const profile = await fetchUserProfile(token);
  if (!profile) {
    deviceLog.warn('wordpressAuth.refreshPersistedUserProfile.empty', {
      hasToken: Boolean(token),
    });
    return null;
  }

  await AsyncStorage.setItem(
    AUTH_STORAGE_KEYS.userProfile,
    JSON.stringify(profile),
  );
  deviceLog.debug('wordpressAuth.refreshPersistedUserProfile.success', {
    userId: profile.id,
    hasMembership: Boolean(profile.membership),
  });
  return profile;
};

type UploadProfileAvatarOptions = {
  uri: string;
  fileName?: string;
  mimeType?: string;
};

const resolveAvatarEndpoint = (): string => {
  const endpoint = WORDPRESS_CONFIG.endpoints.profileAvatar;
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error(
      'Profile avatar endpoint is not configured. Please expose a WordPress REST endpoint that accepts avatar uploads.',
    );
  }
  return endpoint;
};

const buildAvatarFormData = ({
  uri,
  fileName,
  mimeType,
}: UploadProfileAvatarOptions): FormData => {
  if (!uri || typeof uri !== 'string') {
    throw new Error('A valid image selection is required.');
  }

  const normalizedName =
    typeof fileName === 'string' && fileName.trim().length > 0
      ? fileName.trim()
      : 'avatar.jpg';
  const normalizedType =
    typeof mimeType === 'string' && mimeType.trim().length > 0
      ? mimeType.trim()
      : 'image/jpeg';

  const formData = new FormData();
  formData.append('avatar', {
    uri,
    name: normalizedName,
    type: normalizedType,
  } as unknown as Blob);
  return formData;
};

export const uploadProfileAvatar = async (
  options: UploadProfileAvatarOptions,
): Promise<AuthUser> => {
  const formData = buildAvatarFormData(options);
  const endpoint = resolveAvatarEndpoint();
  const session = await restoreSession();
  const token = session?.token?.trim();

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    deviceLog.info('wordpressAuth.uploadProfileAvatar.start', {
      session: describeSessionForLogging(session),
      hasTokenHeader: Boolean(headers.Authorization),
      endpoint: describeUrlForLogging(endpoint),
    });
    const response = await fetchWithRouteFallback(endpoint, {
      method: 'POST',
      headers,
      body: formData,
    });

    deviceLog.debug('wordpressAuth.uploadProfileAvatar.response', {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      deviceLog.error('wordpressAuth.uploadProfileAvatar.failed', {
        status: response.status,
        errorBody,
      });
      throw new Error(
        `Avatar upload failed (${response.status}). ${
          errorBody || 'Enable the WordPress avatar upload endpoint.'
        }`,
      );
    }

    const json = (await response.json()) as Record<string, unknown>;
    const userPayload =
      (json.user as Record<string, unknown> | undefined) ?? json;
    const user = parseProfileUserPayload(userPayload);

    await AsyncStorage.setItem(
      AUTH_STORAGE_KEYS.userProfile,
      JSON.stringify(user),
    );

    deviceLog.success('wordpressAuth.uploadProfileAvatar.success', {
      userId: user.id,
    });

    return user;
  } catch (error) {
    deviceLog.error('wordpressAuth.uploadProfileAvatar.error', {
      message: error instanceof Error ? error.message : String(error),
      session: describeSessionForLogging(session),
    });
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      'Unable to upload profile photo. Please ensure the WordPress avatar upload endpoint is available.',
    );
  }
};

export const ensureValidSession =
  async (): Promise<PersistedSession | null> => {
    const session = await restoreSession();
    deviceLog.info('wordpressAuth.ensureValidSession.start', {
      session: describeSessionForLogging(session),
    });
    if (!session) {
      deviceLog.debug('wordpressAuth.ensureValidSession.noSession');
      return null;
    }

    if (session.locked) {
      deviceLog.debug('wordpressAuth.ensureValidSession.locked', {
        session: describeSessionForLogging(session),
      });
      return session;
    }

    const normalizedToken = normalizeApiToken(session.token);

    if (!normalizedToken) {
      deviceLog.warn('wordpressAuth.ensureValidSession.missingApiToken', {
        session: describeSessionForLogging(session),
      });
      await clearSession();
      return null;
    }

    const tokenResult = await fetchSessionUser(normalizedToken);
    deviceLog.debug('wordpressAuth.ensureValidSession.tokenResult', tokenResult);

    if (tokenResult.user) {
      await AsyncStorage.setItem(
        AUTH_STORAGE_KEYS.userProfile,
        JSON.stringify(tokenResult.user),
      );
      deviceLog.debug('wordpressAuth.ensureValidSession.tokenUser', {
        userId: tokenResult.user.id,
      });
      return {
        ...session,
        token: normalizedToken,
        tokenLoginUrl: undefined,
        user: tokenResult.user,
      };
    }

    const tokenRejected =
      tokenResult.status === 401 || tokenResult.status === 403;

    if (tokenRejected) {
      deviceLog.warn('wordpressAuth.ensureValidSession.tokenRejected', {
        status: tokenResult.status,
      });
      await clearSession();
      return null;
    }

    if (tokenResult.status === 0) {
      deviceLog.warn('wordpressAuth.ensureValidSession.tokenNetworkIssue');
      return session;
    }

    deviceLog.warn('wordpressAuth.ensureValidSession.unexpectedStatus', {
      status: tokenResult.status,
    });
    return session;
  };

export const loginWithPassword = async ({
  username,
  password,
  mode = 'cookie',
  remember = true,
}: LoginOptions): Promise<PersistedSession> => {
  deviceLog.info('wordpressAuth.loginWithPassword.start', {
    username,
    mode,
    remember,
  });
  // Authenticate against the GN Password Login API plugin endpoint so native clients can
  // perform username/password logins over the WordPress REST API.
  const response = await fetchWithRouteFallback(
    WORDPRESS_CONFIG.endpoints.passwordLogin,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        mode,
        remember,
      }),
    },
  );

  let json: GnPasswordLoginResponse;
  try {
    json = (await response.json()) as GnPasswordLoginResponse;
  } catch (error) {
    deviceLog.error('wordpressAuth.loginWithPassword.parseError', {
      message: error instanceof Error ? error.message : String(error),
      status: response.status,
    });
    throw new Error('Unable to log in with WordPress credentials.');
  }

  if (!json || typeof json !== 'object') {
    deviceLog.error('wordpressAuth.loginWithPassword.invalidPayload', {
      status: response.status,
    });
    throw new Error('Unable to log in with WordPress credentials.');
  }

  if (!response.ok || json.success !== true) {
    const message =
      typeof json?.message === 'string' && json.message.trim().length > 0
        ? sanitizeErrorMessage(json.message)
        : 'Unable to log in with WordPress credentials.';
    deviceLog.warn('wordpressAuth.loginWithPassword.failed', {
      status: response.status,
      ok: response.ok,
      success: json.success ?? null,
      code: json.code ?? null,
      dataStatus: json.data?.status ?? null,
      message,
    });
    throw new Error(message);
  }

  const payload = json.user ?? null;
  let user: AuthUser | null = null;

  if (payload) {
    const idSource = payload.id;
    const parsedId =
      typeof idSource === 'number'
        ? idSource
        : typeof idSource === 'string'
        ? Number.parseInt(idSource, 10)
        : Number.NaN;

    const email =
      typeof payload.email === 'string' && payload.email.trim().length > 0
        ? payload.email
        : '';

    const name =
      (typeof payload.display === 'string' &&
        payload.display.trim().length > 0 &&
        payload.display) ||
      (typeof payload.nicename === 'string' &&
        payload.nicename.trim().length > 0 &&
        payload.nicename) ||
      (typeof payload.login === 'string' &&
        payload.login.trim().length > 0 &&
        payload.login) ||
      email ||
      username;

    user = {
      id: Number.isFinite(parsedId) ? parsedId : -1,
      email,
      name,
      firstName: null,
      lastName: null,
      membership: null,
    };
  }

  const woocommerceCredentials =
    parseWooCommerceCredentialBundle(payload?.woocommerce ?? null) ??
    parseWooCommerceCredentialBundle(json.woocommerce ?? null) ??
    createWooCommerceCredentialBundle(
      WORDPRESS_CONFIG.woocommerce.consumerKey,
      WORDPRESS_CONFIG.woocommerce.consumerSecret,
    ) ??
    null;

  if (user) {
    user.woocommerceCredentials = woocommerceCredentials;
  }

  await persistWooCommerceAuthHeader(
    woocommerceCredentials?.basicAuthorizationHeader ?? null,
  );

  const token = normalizeApiToken(json.api_token);

  const rawLoginToken =
    typeof json.token === 'string' ? json.token.trim() : undefined;

  if (rawLoginToken && !normalizeApiToken(rawLoginToken)) {
    deviceLog.debug('wordpressAuth.loginWithPassword.ignoredLoginToken', {
      length: rawLoginToken.length,
    });
  }

  const tokenLoginUrl = undefined;

  const restNonce =
    typeof json.rest_nonce === 'string' && json.rest_nonce.trim().length > 0
      ? json.rest_nonce.trim()
      : typeof json.nonce === 'string' && json.nonce.trim().length > 0
      ? json.nonce.trim()
      : undefined;

  const session: PersistedSession = {
    token,
    user,
    tokenLoginUrl,
    restNonce,
    locked: false,
  };

  deviceLog.debug('wordpressAuth.loginWithPassword.session', {
    status: response.status,
    mode,
    hasApiToken: Boolean(token),
    maskedToken: maskTokenForLogging(token),
    tokenLoginUrl: describeUrlForLogging(tokenLoginUrl ?? null),
    hasRestNonce: Boolean(restNonce),
    restNonceLength: restNonce?.length ?? 0,
    hasUser: Boolean(user),
    wooCredentials: Boolean(woocommerceCredentials),
  });

  await storeSession(session);
  await markPasswordAuthenticated();
  if (mode === 'token') {
    deviceLog.info('wordpressAuth.loginWithPassword.tokenHydration', {
      tokenLoginUrl: describeUrlForLogging(tokenLoginUrl ?? null),
      hasToken: Boolean(token),
      maskedToken: maskTokenForLogging(token),
    });
    await hydrateWordPressCookieSession(tokenLoginUrl, token);
  }

  deviceLog.success('wordpressAuth.loginWithPassword.success', {
    username,
    userId: user?.id ?? null,
  });
  return session;
};

export const updatePassword = async ({
  token,
  currentPassword,
  newPassword,
  confirmPassword,
  tokenLoginUrl,
  restNonce,
  userId,
  identifier,
}: {
  token?: string | null;
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
  tokenLoginUrl?: string | null;
  restNonce?: string | null;
  userId?: number | null;
  identifier?: string | null;
}): Promise<void> => {
  const trimmedCurrent = currentPassword.trim();
  const trimmedNew = newPassword.trim();
  const trimmedConfirm = (confirmPassword ?? newPassword).trim();
  const resolvedUserId =
    typeof userId === 'number' && Number.isFinite(userId) ? userId : null;
  const normalizedIdentifier =
    typeof identifier === 'string' && identifier.trim().length > 0
      ? identifier.trim()
      : undefined;

  if (!trimmedCurrent || !trimmedNew) {
    throw new Error('Unable to change password.');
  }

  await hydrateWordPressCookieSession(tokenLoginUrl, token ?? undefined);
  const performRestPasswordUpdate = async () => {
    const response = await fetchWithRouteFallback(
      WORDPRESS_CONFIG.endpoints.changePassword,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(restNonce
            ? {
                'X-WP-Nonce': restNonce,
              }
            : {}),
          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        body: JSON.stringify({
          current_password: trimmedCurrent,
          new_password: trimmedNew,
          confirm_password: trimmedConfirm,
        }),
      },
    );

    const json = await parseJsonResponse<Record<string, unknown>>(response);
    const successFlag = extractSuccessFlag(json);

    if (!response.ok || successFlag === false) {
      const message = await extractMessageFromResponse(
        response,
        'Unable to change password.',
      );
      throw new Error(message);
    }
  };

  const performSqlPasswordUpdate = async () => {
    if (!resolvedUserId) {
      throw new Error('Unable to change password.');
    }

    const sqlEndpoint = WORDPRESS_CONFIG.endpoints.changePasswordSql;
    if (!sqlEndpoint) {
      throw new Error('Unable to change password.');
    }

    const payload: Record<string, unknown> = {
      user_id: resolvedUserId,
      current_password: trimmedCurrent,
      new_password: trimmedNew,
      confirm_password: trimmedConfirm,
    };

    if (normalizedIdentifier) {
      payload.identifier = normalizedIdentifier;
    }

    const response = await fetchWithRouteFallback(sqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(restNonce
          ? {
              'X-WP-Nonce': restNonce,
            }
          : {}),
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    const json = await parseJsonResponse<Record<string, unknown>>(response);
    const successFlag = extractSuccessFlag(json);

    if (!response.ok || successFlag === false) {
      const message = await extractMessageFromResponse(
        response,
        'Unable to change password.',
      );
      throw new Error(message);
    }
  };

  let restError: Error | null = null;

  try {
    await performRestPasswordUpdate();
  } catch (error) {
    restError =
      error instanceof Error
        ? error
        : new Error('Unable to change password.');
  }

  if (restError) {
    if (!resolvedUserId || !WORDPRESS_CONFIG.endpoints.changePasswordSql) {
      throw restError;
    }

    try {
      await performSqlPasswordUpdate();
      await refreshPersistedUserProfile(token);
      return;
    } catch (sqlError) {
      if (sqlError instanceof Error) {
        throw sqlError;
      }
      throw restError;
    }
  }

  await refreshPersistedUserProfile(token);
};

export const requestPasswordReset = async (
  identifier: string,
): Promise<string | undefined> => {
  const trimmed = identifier.trim();
  if (trimmed.length === 0) {
    throw new Error('Unable to send password reset email.');
  }

  const payload: Record<string, string> = {
    identifier: trimmed,
    user_login: trimmed,
    user_email: trimmed,
    username: trimmed,
    email: trimmed,
    login: trimmed,
  };

  const response = await fetchWithRouteFallback(
    WORDPRESS_CONFIG.endpoints.passwordReset,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  const json = await parseJsonResponse<Record<string, unknown>>(response);
  const successFlag = extractSuccessFlag(json);

  if (!response.ok || successFlag === false) {
    const message = await extractMessageFromResponse(
      response,
      'Unable to send password reset email.',
    );
    throw new Error(message);
  }

  const messageSource =
    (json && typeof json?.message === 'string' && json.message) ||
    (json && typeof json?.notice === 'string' && json.notice) ||
    (json &&
      typeof json?.data === 'object' &&
      json.data !== null &&
      typeof (json.data as Record<string, unknown>).message === 'string' &&
      (json.data as Record<string, unknown>).message) ||
    (json &&
      typeof json?.data === 'object' &&
      json.data !== null &&
      typeof (json.data as Record<string, unknown>).notice === 'string' &&
      (json.data as Record<string, unknown>).notice) ||
    null;

  return messageSource ? sanitizeErrorMessage(messageSource) : undefined;
};

export const registerAccount = async (
  options: RegisterOptions,
): Promise<string | undefined> => {
  const registrationDate =
    typeof options.registrationDate === 'string' &&
    options.registrationDate.trim().length > 0
      ? options.registrationDate
      : new Date().toISOString();

  const username = options.username.trim();
  const email = options.email.trim();
  const firstName = options.firstName?.trim() ?? '';
  const lastName = options.lastName?.trim() ?? '';

  const billing: Record<string, string | undefined> = {
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    email,
  };

  const shipping: Record<string, string | undefined> = {
    first_name: firstName || undefined,
    last_name: lastName || undefined,
  };

  const payload: Record<string, unknown> = {
    username,
    email,
    password: options.password,
    role: 'customer',
    membership_tier: 'blue',
    membership_plan: 'blue-membership',
    create_membership_order: true,
    membership_order_status: 'completed',
    membership_status: 'active',
    membership_purchase_date: registrationDate,
    membership_subscription_date: registrationDate,
    suppress_emails: true,
    suppress_registration_email: true,
    suppress_order_email: true,
    send_user_notification: false,
    woocommerce_customer: {
      role: 'customer',
      email,
      username,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      billing,
      shipping,
      meta_data: [
        { key: 'membership_tier', value: 'blue' },
        { key: 'membership_plan', value: 'blue-membership' },
      ],
    },
    woocommerce_order: {
      status: 'completed',
      set_paid: true,
      payment_method: 'app_membership_auto',
      payment_method_title: 'TCN App Membership',
      currency: 'THB',
      total: '0',
      line_items: [
        {
          name: 'Blue Membership',
          product_sku: 'blue-membership',
          quantity: 1,
          subtotal: '0',
          total: '0',
          meta_data: [
            { key: 'membership_tier', value: 'blue' },
            { key: 'membership_plan', value: 'blue-membership' },
          ],
        },
      ],
      billing,
      shipping,
      date_created_gmt: registrationDate,
      date_paid_gmt: registrationDate,
      meta_data: [
        { key: 'membership_purchase_date', value: registrationDate },
        { key: 'membership_subscription_date', value: registrationDate },
      ],
    },
  };

  if (!payload.username || !payload.email || !payload.password) {
    throw new Error('Unable to register a new account.');
  }

  if (firstName) {
    payload.first_name = firstName;
  }

  if (lastName) {
    payload.last_name = lastName;
  }

  const response = await fetchWithRouteFallback(
    WORDPRESS_CONFIG.endpoints.register,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  const json = await parseJsonResponse<Record<string, unknown>>(response);
  const successFlag = extractSuccessFlag(json);

  if (!response.ok || successFlag === false) {
    const message = await extractMessageFromResponse(
      response,
      'Unable to register a new account.',
    );
    throw new Error(message);
  }

  return 'Registration successful. Please log in to continue.';
};

export const resetPasswordWithCode = async ({
  identifier,
  verificationCode,
  newPassword,
}: {
  identifier: string;
  verificationCode: string;
  newPassword: string;
}): Promise<string | undefined> => {
  const trimmedIdentifier = identifier.trim();
  const trimmedCode = verificationCode.trim();
  const trimmedPassword = newPassword.trim();

  if (!trimmedIdentifier || !trimmedCode || !trimmedPassword) {
    throw new Error('Unable to reset password.');
  }

  const payload: Record<string, string> = {
    identifier: trimmedIdentifier,
    user_login: trimmedIdentifier,
    user_email: trimmedIdentifier,
    username: trimmedIdentifier,
    email: trimmedIdentifier,
    login: trimmedIdentifier,
    verification_code: trimmedCode,
    code: trimmedCode,
    password: trimmedPassword,
    new_password: trimmedPassword,
  };

  const response = await fetchWithRouteFallback(
    WORDPRESS_CONFIG.endpoints.directPasswordReset,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  const json = await parseJsonResponse<Record<string, unknown>>(response);
  const successFlag = extractSuccessFlag(json);

  if (!response.ok || successFlag === false) {
    const message = await extractMessageFromResponse(
      response,
      'Unable to reset password.',
    );
    throw new Error(message);
  }

  const messageSource =
    (json && typeof json?.message === 'string' && json.message) ||
    (json && typeof json?.notice === 'string' && json.notice) ||
    (json &&
      typeof json?.data === 'object' &&
      json.data !== null &&
      typeof (json.data as Record<string, unknown>).message === 'string' &&
      (json.data as Record<string, unknown>).message) ||
    (json &&
      typeof json?.data === 'object' &&
      json.data !== null &&
      typeof (json.data as Record<string, unknown>).notice === 'string' &&
      (json.data as Record<string, unknown>).notice) ||
    null;

  return messageSource ? sanitizeErrorMessage(messageSource) : undefined;
};
