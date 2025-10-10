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
  getSecureValue,
  removeSecureValue,
  setSecureValue,
} from './secureTokenStorage';
import {
  AuthUser,
  AccountStatus,
  LoginOptions,
  MemberQrCode,
  MemberValidationResult,
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
): {
  host?: string;
  pathname?: string;
  hasQuery?: boolean;
  length?: number;
} | null => {
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

const extractTokenFromUrl = (value: string): string | undefined => {
  try {
    const parsed = new URL(value);
    const candidateKeys = [
      'token',
      'jwt',
      'jwt_token',
      'access_token',
      'auth_token',
      'bearer',
      'api_token',
    ];

    for (const key of candidateKeys) {
      const paramValue = parsed.searchParams.get(key);
      if (paramValue && paramValue.trim().length > 0) {
        return paramValue.trim();
      }
    }

    if (parsed.hash) {
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      for (const key of candidateKeys) {
        const paramValue = hashParams.get(key);
        if (paramValue && paramValue.trim().length > 0) {
          return paramValue.trim();
        }
      }
    }
  } catch (error) {
    return undefined;
  }

  return undefined;
};

const normalizeApiToken = (value?: string | null): string | undefined => {
  if (!value || typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const bearerPrefix = /^bearer\s+/i;
  if (bearerPrefix.test(trimmed)) {
    const withoutPrefix = trimmed.replace(bearerPrefix, '').trim();
    return withoutPrefix.length > 0 ? withoutPrefix : undefined;
  }

  if (isLikelyUrl(trimmed)) {
    const extracted = extractTokenFromUrl(trimmed);
    if (extracted) {
      return normalizeApiToken(extracted);
    }
    return undefined;
  }

  return trimmed;
};

const describeSessionForLogging = (
  session?: PersistedSession | null,
): {
  hasToken: boolean;
  maskedToken: string | null;
  hasRefreshToken: boolean;
  maskedRefreshToken: string | null;
  tokenLoginUrl: ReturnType<typeof describeUrlForLogging>;
  locked: boolean;
  hasUser: boolean;
} | null => {
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

interface RestoreSessionOptions {
  silent?: boolean;
}

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

// Attempt to refresh a JWT-style token using the compatible JWT endpoint.
const refreshJwtTokenIfPossible = async (
  token?: string | null,
): Promise<string | null> => {
  const normalized = normalizeApiToken(token ?? undefined);
  if (!normalized) {
    return null;
  }

  try {
    const response = await fetchWithRouteFallback(
      WORDPRESS_CONFIG.endpoints.refreshToken,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${normalized}`,
        },
      },
    );

    const json = (await parseJsonResponse<JwtTokenResponse>(
      response,
    )) as JwtTokenResponse | null;

    if (!response.ok || !json || typeof json !== 'object') {
      return null;
    }

    const newToken = getString(json.token);
    return newToken ?? null;
  } catch (error) {
    return null;
  }
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
  deviceLog.debug('wordpressAuth.cookie.hydrate.disabled', {
    hasTokenLoginUrl: Boolean(tokenLoginUrl),
    hasToken: Boolean(token),
    maskedToken: maskTokenForLogging(token),
  });
  return { status: 0, ok: true };
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
          from: (
            input: string,
            encoding?: string,
          ) => {
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

const appendAvatarCacheBuster = (url: string): string => {
  const timestamp = Date.now().toString();

  try {
    const parsed = new URL(url);
    parsed.searchParams.set('tcn_cache', timestamp);
    return parsed.toString();
  } catch (error) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}tcn_cache=${timestamp}`;
  }
};

// Helper to select an avatar URL from a WordPress avatar_urls map.
// Handles numeric keys reindexed by array_merge as well as known sizes and 'full'.
const pickAvatarUrlFromMap = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const map = value as Record<string, unknown>;
  const preference = [
    'full',
    '512',
    '384',
    '320',
    '300',
    '256',
    '192',
    '128',
    '100',
    '96',
    '64',
    '48',
    '32',
    '24',
    // Some servers accidentally reindex numeric keys; check generic indexes too
    '0', '1', '2', '3', '4', '5', '6', '7'
  ];
  for (const key of preference) {
    const url = getString(map[key]);
    if (url) return url;
  }
  // Fallback: first string value we can find
  for (const v of Object.values(map)) {
    const url = getString(v);
    if (url) return url;
  }
  return null;
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(entry => (typeof entry === 'string' ? entry : getString(entry)))
      .filter((entry): entry is string => Boolean(entry));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(',')
      .map(segment => segment.trim())
      .filter(segment => segment.length > 0);
  }

  return [];
};

const normalizeAccountTypeValue = (
  value: string | null | undefined,
): AuthUser['accountType'] | null => {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();

  if (normalized === 'administrator' || normalized === 'admin') {
    return 'admin';
  }

  if (
    normalized === 'shop_manager' ||
    normalized === 'manager' ||
    normalized === 'staff'
  ) {
    return 'staff';
  }

  if (
    normalized === 'vendor' ||
    normalized === 'tcn_vendor' ||
    normalized === 'store_vendor' ||
    normalized === 'seller'
  ) {
    return 'vendor';
  }

  if (
    normalized === 'customer' ||
    normalized === 'member' ||
    normalized === 'subscriber'
  ) {
    return 'member';
  }

  return normalized as AuthUser['accountType'];
};

const normalizeAccountStatusValue = (
  value: unknown,
): AccountStatus | null => {
  if (value == null) {
    return null;
  }

  const raw =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number'
      ? String(value)
      : '';

  if (!raw) {
    return null;
  }

  const normalized = raw.toLowerCase();

  if (normalized === 'active' || normalized === 'approved' || normalized === 'publish') {
    return 'active';
  }

  if (
    normalized === 'pending' ||
    normalized === 'awaiting' ||
    normalized === 'awaiting_approval' ||
    normalized === 'pending-activation' ||
    normalized === 'review'
  ) {
    return 'pending';
  }

  if (
    normalized === 'rejected' ||
    normalized === 'denied' ||
    normalized === 'declined'
  ) {
    return 'rejected';
  }

  if (
    normalized === 'suspended' ||
    normalized === 'disabled' ||
    normalized === 'blocked'
  ) {
    return 'suspended';
  }

  return normalized as AccountStatus;
};

const parseAccountMetadata = (
  payload: Record<string, unknown>,
): Pick<
  AuthUser,
  'accountType' | 'accountStatus' | 'vendorTier' | 'vendorStatus' | 'qrPayload' | 'qrToken'
> => {
  const meta =
    (payload.meta as Record<string, unknown> | undefined) ?? undefined;

  const candidateTypes = [
    getString(payload.account_type),
    getString(payload.accountType),
    getString(meta?.account_type),
    getString(meta?.accountType),
    getString(payload.role),
    getString(meta?.role),
  ];

  let accountType: AuthUser['accountType'] | null = null;
  for (const candidate of candidateTypes) {
    const normalized = normalizeAccountTypeValue(candidate);
    if (normalized) {
      accountType = normalized;
      break;
    }
  }

  if (!accountType) {
    const roles = [
      ...parseStringArray(payload.roles),
      ...parseStringArray(meta?.roles),
      ...parseStringArray(payload.capabilities),
      ...parseStringArray(meta?.capabilities),
    ];

    for (const role of roles) {
      const normalized = normalizeAccountTypeValue(role);
      if (normalized) {
        accountType = normalized;
        break;
      }
    }
  }

  const vendorTier =
    getString(payload.vendor_tier) ??
    getString(payload.vendorTier) ??
    getString(meta?.vendor_tier) ??
    getString(meta?.vendorTier) ??
    null;

  const statusCandidates: unknown[] = [
    payload.account_status,
    payload.accountStatus,
    payload.status,
    meta?.account_status,
    meta?.accountStatus,
  ];
  let accountStatus: AccountStatus | null = null;
  for (const candidate of statusCandidates) {
    const normalizedStatus = normalizeAccountStatusValue(candidate);
    if (normalizedStatus) {
      accountStatus = normalizedStatus;
      break;
    }
  }

  const vendorStatusCandidates: unknown[] = [
    payload.vendor_status,
    (payload.vendorStatus as unknown),
    meta?.vendor_status,
    meta?.vendorStatus,
  ];
  let vendorStatus: AccountStatus | null = null;
  for (const candidate of vendorStatusCandidates) {
    const normalizedStatus = normalizeAccountStatusValue(candidate);
    if (normalizedStatus) {
      vendorStatus = normalizedStatus;
      break;
    }
  }

  const qrPayload =
    getString(payload.qr_payload) ??
    getString(payload.qrPayload) ??
    getString(meta?.qr_payload) ??
    getString(meta?.qrPayload) ??
    null;

  const qrToken =
    getString(payload.qr_token) ??
    getString(payload.qrToken) ??
    getString(meta?.qr_token) ??
    getString(meta?.qrToken) ??
    null;

  return {
    accountType: accountType ?? null,
    accountStatus: accountStatus ?? null,
    vendorTier: vendorTier ?? null,
    vendorStatus: vendorStatus ?? null,
    qrPayload: qrPayload ?? null,
    qrToken: qrToken ?? null,
  };
};

const parseProfileUserPayload = (
  payload: Record<string, unknown>,
): AuthUser => {
  const membership = parseMembershipInfo(payload);
  const accountMetadata = parseAccountMetadata(payload);

  const idSource = payload.id ?? (payload.ID as unknown);
  const parsedId =
    typeof idSource === 'number'
      ? idSource
      : typeof idSource === 'string'
      ? Number.parseInt(idSource, 10)
      : Number.NaN;

  const emailSource = payload.email ?? payload.user_email ?? '';
  const resolvedEmail =
    typeof emailSource === 'string' ? emailSource : String(emailSource ?? '');

  const nameSource =
    payload.name ??
    payload.user_display_name ??
    payload.username ??
    resolvedEmail;
  const resolvedName =
    typeof nameSource === 'string' && nameSource.trim().length > 0
      ? nameSource
      : resolvedEmail;

  const meta =
    (payload.meta as Record<string, unknown> | undefined) ?? undefined;
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

  const avatarUrls = payload.avatar_urls as Record<string, unknown> | undefined;
  const resolvedAvatarUrl = avatarUrls ? pickAvatarUrlFromMap(avatarUrls) : null;
  const cacheBustedAvatarUrl =
    resolvedAvatarUrl != null ? appendAvatarCacheBuster(resolvedAvatarUrl) : null;

  return {
    id: Number.isFinite(parsedId) ? parsedId : -1,
    email: resolvedEmail,
    name: resolvedName,
    firstName: getString(firstNameSource),
    lastName: getString(lastNameSource),
    avatarUrl: cacheBustedAvatarUrl ?? undefined,
    membership,
    ...accountMetadata,
  };
};

const parseLoginUserPayload = (
  payload: Record<string, unknown> | null | undefined,
): AuthUser | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const idSource =
    source.id ??
    source.ID ??
    source.user_id ??
    source.userId ??
    source.uid ??
    null;
  const parsedId =
    typeof idSource === 'number'
      ? idSource
      : typeof idSource === 'string'
      ? Number.parseInt(idSource, 10)
      : Number.NaN;

  const emailSource =
    source.email ??
    source.user_email ??
    source.login ??
    source.user_login ??
    source.username ??
    source.nicename ??
    source.user_nicename ??
    null;
  const resolvedEmail =
    typeof emailSource === 'string'
      ? emailSource
      : emailSource != null
      ? String(emailSource)
      : '';

  const nameSource =
    source.name ??
    source.display ??
    source.display_name ??
    source.user_display_name ??
    source.nicename ??
    source.user_nicename ??
    resolvedEmail;
  const resolvedName =
    typeof nameSource === 'string' && nameSource.trim().length > 0
      ? nameSource
      : resolvedEmail;

  const firstNameSource =
    source.first_name ?? source.firstName ?? source.user_first_name ?? null;
  const lastNameSource =
    source.last_name ?? source.lastName ?? source.user_last_name ?? null;

  const membership = parseMembershipInfo(
    (source.membership as Record<string, unknown> | undefined) ??
      ((source.meta as Record<string, unknown> | undefined)?.membership as
        | Record<string, unknown>
        | undefined) ??
      undefined,
  );

  const accountMetadata = parseAccountMetadata(
    source as unknown as Record<string, unknown>,
  );

  const wooCredentials =
    parseWooCommerceCredentialBundle(
      source.woocommerce_credentials ?? source.woocommerceCredentials,
    ) ?? null;

  const pickAvatarFromAvatarUrls = (value: unknown): string | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const map = value as Record<string, unknown>;
    const preference = [
      'full',
      '512',
      '384',
      '320',
      '300',
      '256',
      '192',
      '128',
      '100',
      '96',
      '64',
      '48',
      '32',
      '24',
      // Some servers accidentally reindex numeric keys; check generic indexes too
      '0', '1', '2', '3', '4', '5', '6', '7'
    ];
    for (const key of preference) {
      const url = getString(map[key]);
      if (url) return url;
    }
    // Fallback: first string value we can find
    for (const v of Object.values(map)) {
      const url = getString(v);
      if (url) return url;
    }
    return null;
  };

  let avatarSource =
    getString(source.avatar) ??
    getString(source.avatar_url) ??
    getString(source.avatarUrl) ??
    null;

  if (!avatarSource) {
    const fromMap =
      pickAvatarFromAvatarUrls(
        (source as Record<string, unknown>).avatar_urls ??
          (source as Record<string, unknown>).avatarUrls,
      ) ?? null;
    avatarSource = fromMap;
  }

  const cacheBustedAvatarSource =
    avatarSource != null ? appendAvatarCacheBuster(avatarSource) : null;

  return {
    id: Number.isFinite(parsedId) ? parsedId : -1,
    email: resolvedEmail,
    name: resolvedName,
    firstName: getString(firstNameSource),
    lastName: getString(lastNameSource),
    avatarUrl: cacheBustedAvatarSource ?? undefined,
    membership,
    woocommerceCredentials: wooCredentials,
    ...accountMetadata,
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

const parseMemberQrCodePayload = (
  payload: Record<string, unknown> | null | undefined,
  fallbackPayload?: string | null,
): MemberQrCode | null => {
  if (!payload) {
    return null;
  }

  const token =
    getString(payload.token) ??
    getString(payload.qr_token) ??
    getString(payload.code) ??
    null;

  if (!token) {
    return null;
  }

  const payloadValue =
    getString(payload.payload) ??
    getString(payload.qr_payload) ??
    fallbackPayload ??
    null;

  const issuedAt =
    getString(payload.issued_at) ??
    getString(payload.issuedAt) ??
    getString(payload.created_at) ??
    getString(payload.createdAt) ??
    null;

  const expiresAt =
    getString(payload.expires_at) ??
    getString(payload.expiresAt) ??
    null;

  return {
    token,
    payload: payloadValue ?? null,
    issuedAt,
    expiresAt,
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

export const ensureMemberQrCode = async ({
  token,
  payload,
}: {
  token?: string | null;
  payload?: string | null;
}): Promise<MemberQrCode | null> => {
  const normalizedToken = normalizeApiToken(token);
  if (!normalizedToken) {
    deviceLog.debug('wordpressAuth.ensureMemberQrCode.skip', {
      reason: 'missing_token',
    });
    return null;
  }

  const endpoint =
    WORDPRESS_CONFIG.endpoints.membershipQr ?? '/wp-json/gn/v1/membership/qr';

  try {
    const response = await fetchWithRouteFallback(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${normalizedToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        payload && payload.trim().length > 0 ? { payload } : {},
      ),
    });

    deviceLog.debug('wordpressAuth.ensureMemberQrCode.response', {
      status: response.status,
      ok: response.ok,
    });

    const json = await parseJsonResponse<Record<string, unknown> | null>(
      response,
    );

    if (!response.ok) {
      const message =
        (json?.message && typeof json.message === 'string'
          ? sanitizeErrorMessage(json.message)
          : null) ?? null;
      deviceLog.warn('wordpressAuth.ensureMemberQrCode.failed', {
        status: response.status,
        message,
      });
      return null;
    }

    const qrCode = parseMemberQrCodePayload(json ?? undefined, payload ?? null);
    if (!qrCode) {
      deviceLog.warn('wordpressAuth.ensureMemberQrCode.emptyPayload', {
        status: response.status,
      });
    } else {
      deviceLog.debug('wordpressAuth.ensureMemberQrCode.success', {
        tokenPreview: qrCode.token.slice(-4),
      });
    }
    return qrCode;
  } catch (error) {
    deviceLog.warn('wordpressAuth.ensureMemberQrCode.error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const validateMemberQrCode = async (
  qrToken: string,
  authToken?: string | null,
): Promise<MemberValidationResult> => {
  const trimmedToken = (qrToken ?? '').trim();
  if (!trimmedToken) {
    return {
      token: '',
      valid: false,
      message: 'QR token is required.',
    };
  }

  const normalizedAuth = normalizeApiToken(authToken);
  if (!normalizedAuth) {
    throw new Error(
      'Authentication token is required to validate member QR codes.',
    );
  }

  const endpoint =
    WORDPRESS_CONFIG.endpoints.validateQr ??
    '/wp-json/gn/v1/membership/qr/validate';

  try {
    const response = await fetchWithRouteFallback(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${normalizedAuth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: trimmedToken }),
    });

    const json = await parseJsonResponse<Record<string, unknown> | null>(
      response,
    );

    if (!response.ok) {
      const message =
        (json?.message && typeof json.message === 'string'
          ? sanitizeErrorMessage(json.message)
          : 'Unable to validate member QR code.');
      deviceLog.warn('wordpressAuth.validateMemberQrCode.failed', {
        status: response.status,
        message,
      });
      return {
        token: trimmedToken,
        valid: false,
        message,
      };
    }

    const membership = parseMembershipInfo(
      (json?.membership as Record<string, unknown> | undefined) ??
        (json?.member as Record<string, unknown> | undefined)?.membership ??
        undefined,
    );

    const membershipTier =
      membership?.tier ??
      getString(json?.membership_tier) ??
      getString(
        (json?.member as Record<string, unknown> | undefined)?.membership_tier,
      ) ??
      null;

    const allowedDiscount =
      parseDiscountValue(json?.allowed_discount) ??
      parseDiscountValue(json?.discount) ??
      parseDiscountValue(
        (json?.member as Record<string, unknown> | undefined)?.discount,
      ) ??
      null;

    const memberName =
      getString(
        (json?.member as Record<string, unknown> | undefined)?.name ??
          json?.member_name ??
          json?.customer_name ??
          json?.user_name,
      ) ?? null;

    const validFlag = json?.valid;
    const isValid =
      typeof validFlag === 'boolean'
        ? validFlag
        : typeof validFlag === 'string'
        ? validFlag.toLowerCase() === 'true'
        : typeof validFlag === 'number'
        ? validFlag === 1
        : true;

    const result: MemberValidationResult = {
      token: trimmedToken,
      valid: Boolean(isValid),
      memberName,
      membershipTier,
      allowedDiscount: allowedDiscount ?? null,
      membership: membership ?? null,
      message: getString(json?.message) ?? null,
    };

    deviceLog.debug('wordpressAuth.validateMemberQrCode.success', {
      tokenPreview: trimmedToken.slice(-4),
      valid: result.valid,
      membershipTier: result.membershipTier ?? null,
      discount: result.allowedDiscount ?? null,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deviceLog.warn('wordpressAuth.validateMemberQrCode.error', { message });
    return {
      token: trimmedToken,
      valid: false,
      message,
    };
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

  await setSecureValue(AUTH_STORAGE_KEYS.token, normalizedToken);
  // Also persist a non-secure fallback copy so requests that cannot read
  // encrypted storage (or after process restarts) can still attach auth.
  if (normalizedToken) {
    entries.push([AUTH_STORAGE_KEYS.token, normalizedToken]);
  } else {
    removals.push(AUTH_STORAGE_KEYS.token);
  }

  if (refreshToken && refreshToken.trim().length > 0) {
    await setSecureValue(AUTH_STORAGE_KEYS.refreshToken, refreshToken);
  } else {
    await removeSecureValue(AUTH_STORAGE_KEYS.refreshToken);
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
    ? user.woocommerceCredentials.basicAuthorizationHeader ??
      createWooCommerceCredentialBundle(
        user.woocommerceCredentials.consumerKey,
        user.woocommerceCredentials.consumerSecret,
        user.woocommerceCredentials.basicAuthorizationHeader ?? null,
      )?.basicAuthorizationHeader ??
      null
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
  await Promise.all([
    removeSecureValue(AUTH_STORAGE_KEYS.token),
    removeSecureValue(AUTH_STORAGE_KEYS.refreshToken),
    removeSecureValue(AUTH_STORAGE_KEYS.credentialEmail),
    removeSecureValue(AUTH_STORAGE_KEYS.credentialPassword),
  ]);
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

export const restoreSession = async (
  options: RestoreSessionOptions = {},
): Promise<PersistedSession | null> => {
  const { silent = false } = options;
  const [rawToken, rawRefreshToken, storedTuples, plainToken] = await Promise.all([
    getSecureValue(AUTH_STORAGE_KEYS.token),
    getSecureValue(AUTH_STORAGE_KEYS.refreshToken),
    AsyncStorage.multiGet([
      AUTH_STORAGE_KEYS.userProfile,
      AUTH_STORAGE_KEYS.sessionLock,
      AUTH_STORAGE_KEYS.tokenLoginUrl,
      AUTH_STORAGE_KEYS.wpRestNonce,
    ]),
    // Plain-text fallback copy persisted alongside encrypted storage
    AsyncStorage.getItem(AUTH_STORAGE_KEYS.token),
  ]);

  const storedValues = Object.fromEntries(storedTuples);
  const userJson = storedValues[AUTH_STORAGE_KEYS.userProfile];
  const lockValue = storedValues[AUTH_STORAGE_KEYS.sessionLock];
  const storedTokenLoginUrl = storedValues[AUTH_STORAGE_KEYS.tokenLoginUrl];
  const storedRestNonce = storedValues[AUTH_STORAGE_KEYS.wpRestNonce];

  if (storedTokenLoginUrl && storedTokenLoginUrl.length > 0) {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.tokenLoginUrl);
  }

  // Prefer secure storage; fall back to plain AsyncStorage copy if needed
  const token = normalizeApiToken((rawToken ?? plainToken) ?? undefined);
  if (rawToken && !token) {
    if (!silent) {
      deviceLog.debug('wordpressAuth.restoreSession.ignoredToken', {
        length: rawToken.length,
      });
    }
  }
  const refreshToken = rawRefreshToken ?? undefined;

  if (!token && !userJson) {
    if (!silent) {
      deviceLog.debug('wordpressAuth.restoreSession.empty');
    }
    lastRestoreSessionLogSummary = null;
    return null;
  }

  let user: AuthUser | null = null;

  if (userJson) {
    try {
      user = JSON.parse(userJson) as AuthUser;
    } catch (error) {
      if (!silent) {
        deviceLog.warn('wordpressAuth.restoreSession.userParseError', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
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
    if (!silent) {
      deviceLog.debug('wordpressAuth.restoreSession.success', {
        session: sessionSummary,
      });
    }
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
  let endpoint = WORDPRESS_CONFIG.endpoints.profileAvatar;
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error(
      'Profile avatar endpoint is not configured. Please expose a WordPress REST endpoint that accepts avatar uploads.',
    );
  }

  const trimmed = endpoint.trim();
  // Guard against misconfiguration where endpoint ends up as '/' or very short
  if (trimmed === '/' || trimmed.length < 10) {
    endpoint = '/wp-json/gn/v1/profile/avatar';
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
  let endpoint = resolveAvatarEndpoint();
  if (endpoint === '/' || endpoint.trim().length < 10) {
    endpoint = '/wp-json/gn/v1/profile/avatar';
  }
  let session = await restoreSession();
  const restNonce = session?.restNonce?.trim();

  // Build request init via WordPress helper so Authorization is ensured
  // Try to resolve a bearer token eagerly
  let tokenSource: 'session' | 'secure' | 'async' | null = null;
  let token = normalizeApiToken(session?.token);
  if (token) {
    tokenSource = 'session';
  }
  if (!token) {
    try {
      const secure = await getSecureValue(AUTH_STORAGE_KEYS.token);
      token = normalizeApiToken(secure ?? undefined);
      if (token) tokenSource = 'secure';
    } catch {}
  }
  if (!token) {
    try {
      const plain = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.token);
      token = normalizeApiToken(plain ?? undefined);
      if (token) tokenSource = 'async';
    } catch {}
  }

  // If we resolved a token outside of the restored session, update the session
  // so downstream logs and helpers see hasToken = true.
  try {
    if (token && (!session || !session.token)) {
      const patched: PersistedSession = {
        token,
        refreshToken: session?.refreshToken,
        tokenLoginUrl: undefined,
        restNonce: session?.restNonce ?? undefined,
        user: session?.user ?? null,
        locked: Boolean(session?.locked) && !!session?.locked,
      };
      await storeSession(patched);
      session = patched;
    }
  } catch (e) {
    // non-fatal; continue with local token
  }

  // Preemptive re-auth: if no token is available, attempt a background re-login
  // using securely stored credentials (mirrors the smoke script's login-first flow).
  if (!token) {
    try {
      const savedEmail = await getSecureValue(AUTH_STORAGE_KEYS.credentialEmail);
      const savedPassword = await getSecureValue(
        AUTH_STORAGE_KEYS.credentialPassword,
      );
      if (savedEmail && savedPassword) {
        deviceLog.info('wordpressAuth.uploadProfileAvatar.preauth.attempt');
        const reauthSession = await loginWithPassword({
          email: savedEmail,
          password: savedPassword,
          remember: true,
        });
        const t = normalizeApiToken(reauthSession.token);
        if (t) {
          token = t;
          tokenSource = 'session';
          session = reauthSession;
          deviceLog.success('wordpressAuth.uploadProfileAvatar.preauth.succeeded', {
            maskedToken: maskTokenForLogging(token),
          });
        }
      }
    } catch (preauthError) {
      deviceLog.warn('wordpressAuth.uploadProfileAvatar.preauth.failed', {
        message:
          preauthError instanceof Error
            ? preauthError.message
            : String(preauthError),
      });
    }
  }

  const baseInit: RequestInit = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(restNonce ? { 'X-WP-Nonce': restNonce } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(token ? { 'X-Authorization': `Bearer ${token}` } : {}),
    },
    body: formData,
  };

  const preparedInit = await buildWordPressRequestInit(baseInit);

  // As a final defense for hosts that strip headers on multipart, also include the token as a form field
  try {
    if (token && preparedInit && preparedInit.body && typeof (preparedInit.body as any).append === 'function') {
      (preparedInit.body as any).append('token', token);
    }
  } catch {}

  // Final fallback: also include the token in the query string. Some hosts
  // strip Authorization headers on multipart/form-data requests and may not
  // pass custom headers through. The server accepts a `token` parameter.
  try {
    if (token && !/([?&])token=/.test(endpoint)) {
      const join = endpoint.includes('?') ? '&' : '?';
      endpoint = `${endpoint}${join}token=${encodeURIComponent(token)}`;
    }
  } catch {}

  const hasAuthHeader = (() => {
    const h = preparedInit.headers as HeadersInit | undefined;
    if (!h) return false;
    if (typeof Headers !== 'undefined' && h instanceof Headers) {
      return Boolean(h.get('authorization'));
    }
    if (Array.isArray(h)) {
      return h.some(([k]) => String(k).toLowerCase() === 'authorization');
    }
    const rec = h as Record<string, string>;
    return Object.keys(rec).some(k => k.toLowerCase() === 'authorization');
  })();

  try {
    // For diagnostics, compute the primary URL the request builder will use
    let primaryUrlForLog: string | null = null;
    try {
      primaryUrlForLog = appendWooCommerceCredentialsIfNeeded(
        buildUrl(endpoint),
        endpoint,
      );
    } catch {}

    deviceLog.info('wordpressAuth.uploadProfileAvatar.start', {
      session: describeSessionForLogging(session),
      hasTokenHeader: hasAuthHeader,
      hasResolvedToken: Boolean(token),
      tokenSource,
      maskedResolvedToken: maskTokenForLogging(token),
      endpoint: describeUrlForLogging(primaryUrlForLog ?? endpoint),
    });
    let response = await fetchWithRouteFallback(endpoint, preparedInit);

    deviceLog.debug('wordpressAuth.uploadProfileAvatar.response', {
      status: response.status,
      ok: response.ok,
    });

    // If unauthorized, try to refresh JWT token once and retry
    if (response.status === 401 || response.status === 403) {
      deviceLog.info('wordpressAuth.uploadProfileAvatar.unauthorized', {
        status: response.status,
      });
      deviceLog.info('wordpressAuth.uploadProfileAvatar.refreshToken.attempt', {
        hadToken: Boolean(token),
        maskedToken: maskTokenForLogging(token),
      });
      const refreshed = await refreshJwtTokenIfPossible(token ?? undefined);
      if (refreshed) {
        deviceLog.success('wordpressAuth.uploadProfileAvatar.refreshToken.succeeded', {
          maskedToken: maskTokenForLogging(refreshed),
        });
        await storeSession({
          token: refreshed,
          refreshToken: session?.refreshToken,
          tokenLoginUrl: undefined,
          restNonce: session?.restNonce ?? undefined,
          user: session?.user ?? null,
        });
        token = refreshed;
        // Rebuild headers/body/query with new token
        const retryInit: RequestInit = {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            ...(restNonce ? { 'X-WP-Nonce': restNonce } : {}),
            Authorization: `Bearer ${token}`,
            'X-Authorization': `Bearer ${token}`,
          },
          body: formData,
        };
        const preparedRetry = await buildWordPressRequestInit(retryInit);
        try {
          if (preparedRetry && preparedRetry.body && typeof (preparedRetry.body as any).append === 'function') {
            (preparedRetry.body as any).append('token', token);
          }
        } catch {}
        try {
          if (token && !/([?&])token=/.test(endpoint)) {
            const join2 = endpoint.includes('?') ? '&' : '?';
            endpoint = `${endpoint}${join2}token=${encodeURIComponent(token)}`;
          }
        } catch {}
        deviceLog.info('wordpressAuth.uploadProfileAvatar.retry.start', {
          endpoint: describeUrlForLogging(endpoint),
          hasRestNonce: Boolean(restNonce),
        });
        response = await fetchWithRouteFallback(endpoint, preparedRetry);
        deviceLog.debug('wordpressAuth.uploadProfileAvatar.retry.response', {
          status: response.status,
          ok: response.ok,
        });
      } else {
        deviceLog.warn('wordpressAuth.uploadProfileAvatar.refreshToken.unavailable');
        // Last-chance fallback: if stored credentials exist, perform a quick re-login
        try {
          const savedEmail = await getSecureValue(
            AUTH_STORAGE_KEYS.credentialEmail,
          );
          const savedPassword = await getSecureValue(
            AUTH_STORAGE_KEYS.credentialPassword,
          );
          if (savedEmail && savedPassword) {
            deviceLog.info('wordpressAuth.uploadProfileAvatar.reauth.attempt', {
              hasSavedCredentials: true,
            });
            const reauthSession = await loginWithPassword({
              email: savedEmail,
              password: savedPassword,
              remember: true,
            });
            token = normalizeApiToken(reauthSession.token);
            if (token) {
              const retryInit2: RequestInit = {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  ...(restNonce ? { 'X-WP-Nonce': restNonce } : {}),
                  Authorization: `Bearer ${token}`,
                  'X-Authorization': `Bearer ${token}`,
                },
                body: formData,
              };
              const preparedRetry2 = await buildWordPressRequestInit(retryInit2);
              try {
                if (
                  preparedRetry2 &&
                  preparedRetry2.body &&
                  typeof (preparedRetry2.body as any).append === 'function'
                ) {
                  (preparedRetry2.body as any).append('token', token);
                }
              } catch {}
              try {
                if (token && !/([?&])token=/.test(endpoint)) {
                  const join3 = endpoint.includes('?') ? '&' : '?';
                  endpoint = `${endpoint}${join3}token=${encodeURIComponent(token)}`;
                }
              } catch {}
              deviceLog.info('wordpressAuth.uploadProfileAvatar.reauth.retry.start');
              response = await fetchWithRouteFallback(endpoint, preparedRetry2);
              deviceLog.debug(
                'wordpressAuth.uploadProfileAvatar.reauth.retry.response',
                {
                  status: response.status,
                  ok: response.ok,
                },
              );
            }
          }
        } catch (e) {
          deviceLog.warn('wordpressAuth.uploadProfileAvatar.reauth.failed', {
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

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

export const deleteProfileAvatar = async (): Promise<AuthUser> => {
  let endpoint = resolveAvatarEndpoint();
  let session = await restoreSession();
  const restNonce = session?.restNonce?.trim();

  let tokenSource: 'session' | 'secure' | 'async' | null = null;
  let token = normalizeApiToken(session?.token);
  if (token) {
    tokenSource = 'session';
  }

  if (!token) {
    try {
      const secure = await getSecureValue(AUTH_STORAGE_KEYS.token);
      token = normalizeApiToken(secure ?? undefined);
      if (token) {
        tokenSource = 'secure';
      }
    } catch {}
  }

  if (!token) {
    try {
      const plain = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.token);
      token = normalizeApiToken(plain ?? undefined);
      if (token) {
        tokenSource = 'async';
      }
    } catch {}
  }

  if (token && (!session || !session.token)) {
    try {
      const patched: PersistedSession = {
        token,
        refreshToken: session?.refreshToken,
        tokenLoginUrl: undefined,
        restNonce: session?.restNonce ?? undefined,
        user: session?.user ?? null,
        locked: Boolean(session?.locked) && !!session?.locked,
      };
      await storeSession(patched);
      session = patched;
    } catch {}
  }

  const baseInit: RequestInit = {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      ...(restNonce ? { 'X-WP-Nonce': restNonce } : {}),
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
            'X-Authorization': `Bearer ${token}`,
          }
        : {}),
    },
  };

  const preparedInit = await buildWordPressRequestInit(baseInit);

  deviceLog.info('wordpressAuth.deleteProfileAvatar.start', {
    session: describeSessionForLogging(session),
    hasTokenHeader: Boolean(token),
    tokenSource,
    maskedToken: maskTokenForLogging(token),
    endpoint: describeUrlForLogging(endpoint),
  });

  let response = await fetchWithRouteFallback(endpoint, preparedInit);

  deviceLog.debug('wordpressAuth.deleteProfileAvatar.response', {
    status: response.status,
    ok: response.ok,
  });

  if (response.status === 401 || response.status === 403) {
    deviceLog.info('wordpressAuth.deleteProfileAvatar.unauthorized', {
      status: response.status,
    });

    const refreshed = await refreshJwtTokenIfPossible(token ?? session?.token);
    if (refreshed) {
      token = refreshed;
      try {
        const patched: PersistedSession = {
          token: refreshed,
          refreshToken: session?.refreshToken,
          tokenLoginUrl: undefined,
          restNonce: session?.restNonce ?? undefined,
          user: session?.user ?? null,
          locked: Boolean(session?.locked) && !!session?.locked,
        };
        await storeSession(patched);
        session = patched;
      } catch {}

      const retryInit: RequestInit = {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          ...(restNonce ? { 'X-WP-Nonce': restNonce } : {}),
          Authorization: `Bearer ${refreshed}`,
          'X-Authorization': `Bearer ${refreshed}`,
        },
      };
      const preparedRetry = await buildWordPressRequestInit(retryInit);
      deviceLog.info('wordpressAuth.deleteProfileAvatar.retry.start', {
        endpoint: describeUrlForLogging(endpoint),
        hasRestNonce: Boolean(restNonce),
      });
      response = await fetchWithRouteFallback(endpoint, preparedRetry);
      deviceLog.debug('wordpressAuth.deleteProfileAvatar.retry.response', {
        status: response.status,
        ok: response.ok,
      });
    } else {
      deviceLog.warn('wordpressAuth.deleteProfileAvatar.refreshToken.unavailable');
    }
  }

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch {}
    deviceLog.error('wordpressAuth.deleteProfileAvatar.failed', {
      status: response.status,
      errorBody,
    });
    throw new Error(
      `Avatar removal failed (${response.status}). ${
        errorBody || 'Enable the WordPress avatar endpoint.'
      }`,
    );
  }

  let user: AuthUser | null = null;
  if (response.status !== 204) {
    try {
      const json = (await response.json()) as Record<string, unknown>;
      const userPayload =
        (json.user as Record<string, unknown> | undefined) ?? json;
      user = parseProfileUserPayload(userPayload);
    } catch (error) {
      deviceLog.debug('wordpressAuth.deleteProfileAvatar.parseFallback', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!user) {
    user = await refreshPersistedUserProfile(token ?? session?.token ?? null);
  }

  if (!user && session?.user) {
    user = { ...session.user, avatarUrl: undefined };
  }

  if (!user) {
    throw new Error(
      'Unable to remove profile photo. Please ensure the WordPress avatar endpoint is available.',
    );
  }

  if (session) {
    const nextSession: PersistedSession = {
      token: token ?? session.token,
      refreshToken: session.refreshToken,
      tokenLoginUrl: undefined,
      restNonce: session.restNonce ?? undefined,
      user,
      locked: Boolean(session.locked) && !!session.locked,
    };
    await storeSession(nextSession);
  } else {
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEYS.userProfile,
      JSON.stringify(user),
    );
  }

  deviceLog.success('wordpressAuth.deleteProfileAvatar.success', {
    userId: user.id,
  });

  return user;
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
    deviceLog.debug(
      'wordpressAuth.ensureValidSession.tokenResult',
      tokenResult,
    );

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
      // Try to refresh JWT token and re-validate once
      deviceLog.info('wordpressAuth.ensureValidSession.refreshToken.attempt', {
        hadToken: Boolean(normalizedToken),
        maskedToken: maskTokenForLogging(normalizedToken),
      });
      const refreshed = await refreshJwtTokenIfPossible(normalizedToken);
      if (refreshed) {
        deviceLog.success(
          'wordpressAuth.ensureValidSession.refreshToken.succeeded',
          {
            maskedToken: maskTokenForLogging(refreshed),
          },
        );
        await storeSession({
          token: refreshed,
          refreshToken: session.refreshToken,
          tokenLoginUrl: undefined,
          restNonce: session.restNonce ?? undefined,
          user: session.user,
        });
        deviceLog.info('wordpressAuth.ensureValidSession.retry.start');
        const retry = await fetchSessionUser(refreshed);
        deviceLog.debug('wordpressAuth.ensureValidSession.retryTokenResult', retry);
        if (retry.user) {
          await AsyncStorage.setItem(
            AUTH_STORAGE_KEYS.userProfile,
            JSON.stringify(retry.user),
          );
          deviceLog.success('wordpressAuth.ensureValidSession.retry.success', {
            userId: retry.user.id,
          });
          return {
            ...session,
            token: refreshed,
            tokenLoginUrl: undefined,
            user: retry.user,
          };
        } else {
          deviceLog.warn('wordpressAuth.ensureValidSession.retry.failed', {
            status: retry.status,
          });
        }
      } else {
        deviceLog.warn('wordpressAuth.ensureValidSession.refreshToken.unavailable');
      }
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

export const ensureValidSessionToken = async (
  providedToken?: string | null,
): Promise<string | null> => {
  const normalizedProvided = normalizeApiToken(providedToken);
  if (normalizedProvided) {
    return normalizedProvided;
  }

  const session = await ensureValidSession();
  return session?.token ?? null;
};

interface JwtTokenResponse {
  token?: string;
  api_token?: string;
  apiToken?: string;
  login_token?: string;
  loginToken?: string;
  refresh_token?: string;
  user_email?: string;
  user_nicename?: string;
  user_display_name?: string;
  expires_in?: number;
  message?: string;
  code?: string;
  data?: { status?: number };
  token_login_url?: string;
  tokenLoginUrl?: string;
  rest_nonce?: string;
  restNonce?: string;
  mode?: string;
  user?: Record<string, unknown> | null;
  success?: boolean;
}

export const loginWithPassword = async ({
  email,
  password,
  mode,
  remember,
}: LoginOptions): Promise<PersistedSession> => {
  deviceLog.info('wordpressAuth.loginWithPassword.start', {
    email,
  });

  const requestBody: Record<string, unknown> = {
    username: email,
    password,
  };

  if (mode) {
    requestBody.mode = mode;
  }

  if (typeof remember === 'boolean') {
    requestBody.remember = remember;
  }

  const response = await fetchWithRouteFallback(
    WORDPRESS_CONFIG.endpoints.passwordLogin,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  let json: JwtTokenResponse;
  try {
    json = (await response.json()) as JwtTokenResponse;
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

  const rawApiTokenValue =
    getString(json.api_token) ?? getString((json as any).apiToken);
  const rawTokenFieldValue = getString(json.token);
  const rawTokenValue = rawApiTokenValue ?? rawTokenFieldValue;
  const rawTokenType =
    rawTokenFieldValue != null
      ? typeof json.token
      : rawApiTokenValue != null
      ? typeof json.api_token
      : 'undefined';
  const hasResponseToken = Boolean(rawTokenValue);
  const rawTokenLoginUrl =
    getString(json.token_login_url) ??
    getString(json.tokenLoginUrl) ??
    getString((json as any).redirect);

  // Debug which keys the server actually returned (no secrets exposed)
  try {
    deviceLog.debug('wordpressAuth.loginWithPassword.payloadKeys', {
      hasApiToken: Boolean(rawApiTokenValue),
      hasTokenField: Boolean(rawTokenFieldValue),
      hasTokenLoginUrl: Boolean(rawTokenLoginUrl),
      hasUser: Boolean(json.user),
      tokenPreview:
        rawTokenValue && rawTokenValue.length >= 8
          ? `***${rawTokenValue.slice(-4)}(len=${rawTokenValue.length})`
          : null,
    });
  } catch {}

  if (!response.ok || (!hasResponseToken && !rawTokenLoginUrl)) {
    const message =
      typeof json?.message === 'string' && json.message.trim().length > 0
        ? sanitizeErrorMessage(json.message)
        : 'Unable to log in with WordPress credentials.';
    deviceLog.warn('wordpressAuth.loginWithPassword.failed', {
      status: response.status,
      ok: response.ok,
      code: json.code ?? null,
      dataStatus: json.data?.status ?? null,
      message,
      hasTokenLoginUrl: Boolean(rawTokenLoginUrl),
    });
    throw new Error(message);
  }

  // Prefer the explicit api_token as the bearer token.
  // Only treat the legacy `token` field as a possible URL handoff.
  let token: string | undefined;
  let tokenLoginUrl = rawTokenLoginUrl ?? undefined;

  if (rawApiTokenValue) {
    token = rawApiTokenValue; // opaque API token (not a URL/JWT is fine)
  } else if (rawTokenFieldValue) {
    const normalized = normalizeApiToken(rawTokenFieldValue);
    if (normalized) {
      token = normalized;
    } else if (isLikelyUrl(rawTokenFieldValue)) {
      tokenLoginUrl = tokenLoginUrl ?? rawTokenFieldValue;
    }
  }
  const restNonce =
    getString(json.rest_nonce) ?? getString(json.restNonce) ?? undefined;

  if (!token && tokenLoginUrl) {
    deviceLog.info('wordpressAuth.loginWithPassword.tokenLoginOnly', {
      hasTokenLoginUrl: Boolean(tokenLoginUrl),
      hasRestNonce: Boolean(restNonce),
    });
  } else if (!token) {
    deviceLog.error('wordpressAuth.loginWithPassword.invalidToken', {
      token: maskTokenForLogging(rawTokenValue ?? null),
      rawTokenType,
      rawTokenLength: rawTokenValue ? rawTokenValue.length : null,
      rawTokenIsUrl: rawTokenValue ? isLikelyUrl(rawTokenValue) : null,
      hasApiTokenField: Boolean(rawApiTokenValue),
      hasTokenLoginUrl: Boolean(tokenLoginUrl),
      responseStatus: response.status,
    });
    throw new Error('Unable to log in with WordPress credentials.');
  }

  const refreshToken =
    typeof json.refresh_token === 'string' &&
    json.refresh_token.trim().length > 0
      ? json.refresh_token.trim()
      : undefined;

  const loginUser = parseLoginUserPayload(json.user ?? null);
  const profile = token ? await fetchUserProfile(token) : null;

  const fallbackEmail =
    loginUser?.email ??
    (typeof json.user_email === 'string' && json.user_email.trim().length > 0
      ? json.user_email.trim()
      : null) ??
    email;

  const fallbackName =
    loginUser?.name ??
    (typeof json.user_display_name === 'string' &&
    json.user_display_name.trim().length > 0
      ? json.user_display_name.trim()
      : typeof json.user_nicename === 'string' &&
        json.user_nicename.trim().length > 0
      ? json.user_nicename.trim()
      : null) ??
    fallbackEmail;

  const defaultWooCredentials = createWooCommerceCredentialBundle(
    WORDPRESS_CONFIG.woocommerce.consumerKey,
    WORDPRESS_CONFIG.woocommerce.consumerSecret,
  );

  const user: AuthUser | null = profile
    ? {
        ...profile,
        woocommerceCredentials:
          profile.woocommerceCredentials ?? defaultWooCredentials,
      }
    : loginUser
    ? {
        ...loginUser,
        woocommerceCredentials:
          loginUser.woocommerceCredentials ?? defaultWooCredentials,
      }
    : {
        id: -1,
        email: fallbackEmail,
        name: fallbackName,
        firstName: null,
        lastName: null,
        membership: null,
        woocommerceCredentials: defaultWooCredentials,
        accountType: null,
        accountStatus: null,
        vendorTier: null,
        vendorStatus: null,
        qrPayload: null,
        qrToken: null,
      };

  const session: PersistedSession = {
    token,
    refreshToken,
    user,
    tokenLoginUrl,
    restNonce,
    locked: false,
  };

  deviceLog.debug('wordpressAuth.loginWithPassword.session', {
    status: response.status,
    hasApiToken: Boolean(token),
    maskedToken: maskTokenForLogging(token),
    hasRefreshToken: Boolean(refreshToken),
    hasUser: Boolean(user),
    wooCredentials: Boolean(user?.woocommerceCredentials ?? null),
    hasTokenLoginUrl: Boolean(tokenLoginUrl),
    hasRestNonce: Boolean(restNonce),
  });

  await storeSession(session);
  await markPasswordAuthenticated();
  // Optionally persist credentials for re-auth fallback (only when remember is true)
  try {
    if (remember) {
      await setSecureValue(AUTH_STORAGE_KEYS.credentialEmail, email);
      await setSecureValue(AUTH_STORAGE_KEYS.credentialPassword, password);
      deviceLog.debug('wordpressAuth.loginWithPassword.credentialsStored');
    } else {
      await removeSecureValue(AUTH_STORAGE_KEYS.credentialEmail);
      await removeSecureValue(AUTH_STORAGE_KEYS.credentialPassword);
    }
  } catch (error) {
    deviceLog.warn('wordpressAuth.loginWithPassword.storeCredentialsFailed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  deviceLog.success('wordpressAuth.loginWithPassword.success', {
    email,
    userId: user?.id ?? null,
  });
  return session;
};

export const updatePassword = async ({
  token,
  currentPassword,
  newPassword,
  confirmPassword: _confirmPassword,
  tokenLoginUrl,
  restNonce,
  userId: _userId,
  identifier: _identifier,
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
          password: trimmedNew,
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

  try {
    await performRestPasswordUpdate();
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error('Unable to change password.');
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

  const requestedAccountType =
    (options.accountType ?? 'member').toLowerCase();
  const normalizedAccountType =
    requestedAccountType === 'vendor' ? 'vendor' : 'member';
  const isVendor = normalizedAccountType === 'vendor';
  const selectedVendorTier =
    typeof options.vendorTier === 'string' && options.vendorTier.trim().length > 0
      ? options.vendorTier.trim()
      : undefined;

  const payload: Record<string, unknown> = {
    username,
    email,
    password: options.password,
    suppress_emails: true,
    suppress_registration_email: true,
    suppress_order_email: true,
    send_user_notification: false,
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

  if (isVendor) {
    const vendorMeta = {
      account_type: 'vendor',
      account_status: 'pending',
      vendor_status: 'pending',
      vendor_tier: selectedVendorTier ?? undefined,
    };

    payload.role = 'vendor';
    payload.account_type = 'vendor';
    payload.accountType = 'vendor';
    payload.status = 'pending';
    payload.account_status = 'pending';
    payload.vendor_status = 'pending';
    if (selectedVendorTier) {
      payload.vendor_tier = selectedVendorTier;
    }
    payload.meta = vendorMeta;
    payload.woocommerce_customer = {
      role: 'vendor',
      email,
      username,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      billing,
      shipping,
      meta_data: [
        { key: 'account_status', value: 'pending' },
        { key: 'vendor_status', value: 'pending' },
        selectedVendorTier
          ? { key: 'vendor_tier', value: selectedVendorTier }
          : null,
      ],
    };
    payload.woocommerce_customer.meta_data = payload.woocommerce_customer.meta_data
      .filter(Boolean)
      .map(entry => entry as { key: string; value: string });
  } else {
    payload.role = 'customer';
    payload.membership_tier = 'blue';
    payload.membership_plan = 'blue-membership';
    payload.create_membership_order = true;
    payload.membership_order_status = 'completed';
    payload.membership_status = 'active';
    payload.membership_purchase_date = registrationDate;
    payload.membership_subscription_date = registrationDate;
    payload.woocommerce_customer = {
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
    };
    payload.woocommerce_order = {
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
    };
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

  if (isVendor) {
    return 'Thank you! Your vendor application is pending review. We will notify you once an administrator activates your account.';
  }

  return 'Registration successful. Please log in to continue.';
};

export const resetPasswordWithCode = async ({
  identifier,
  verificationCode,
  newPassword,
  resetKey,
}: {
  identifier: string;
  verificationCode: string;
  newPassword: string;
  resetKey?: string;
}): Promise<string | undefined> => {
  const trimmedIdentifier = identifier.trim();
  const trimmedCode = verificationCode.trim();
  const trimmedPassword = newPassword.trim();
  const trimmedKey =
    typeof resetKey === 'string' && resetKey.trim().length > 0
      ? resetKey.trim()
      : undefined;

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

  if (trimmedKey) {
    payload.key = trimmedKey;
  }

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
