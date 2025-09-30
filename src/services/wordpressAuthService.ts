import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_STORAGE_KEYS, WORDPRESS_CONFIG } from '../config/authConfig';
import {
  AuthUser,
  LoginOptions,
  MembershipBenefit,
  MembershipInfo,
  RegisterOptions,
} from '../types/auth';

export interface PersistedSession {
  token?: string;
  refreshToken?: string;
  user: AuthUser | null;
  locked: boolean;
}

interface GnPasswordLoginUserPayload {
  id?: number | string;
  login?: string;
  email?: string;
  nicename?: string;
  display?: string;
}

interface GnPasswordLoginResponse {
  success?: boolean;
  mode?: 'token' | 'cookie';
  message?: string;
  token?: string;
  token_expires_in?: number;
  token_login_url?: string;
  user?: GnPasswordLoginUserPayload | null;
  code?: string;
  data?: { status?: number };
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
  const primaryUrl = buildUrl(path);
  const primaryResponse = await fetch(primaryUrl, init);

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

  const fallbackUrl = buildRestRouteUrl(path);
  return fetch(fallbackUrl, init);
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
    const response = await fetchWithRouteFallback(
      WORDPRESS_CONFIG.endpoints.profile,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const membership = parseMembershipInfo(payload);

    const idSource = payload.id ?? (payload.ID as unknown);
    const parsedId =
      typeof idSource === 'number'
        ? idSource
        : typeof idSource === 'string'
        ? Number.parseInt(idSource, 10)
        : Number.NaN;
    const emailSource = payload.email ?? payload.user_email ?? '';
    const nameSource =
      payload.name ??
      payload.user_display_name ??
      payload.username ??
      emailSource;

    return {
      id: Number.isFinite(parsedId) ? parsedId : -1,
      email:
        typeof emailSource === 'string'
          ? emailSource
          : String(emailSource ?? ''),
      name:
        typeof nameSource === 'string' ? nameSource : String(nameSource ?? ''),
      avatarUrl:
        (payload.avatar_urls as Record<string, string> | undefined)?.['96'] ??
        (payload.avatar_urls as Record<string, string> | undefined)?.['48'],
      membership,
    };
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
  user,
}: Omit<PersistedSession, 'locked'>) => {
  const entries: [string, string][] = [];
  const removals: string[] = [];

  if (token) {
    entries.push([AUTH_STORAGE_KEYS.token, token]);
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

  if (entries.length > 0) {
    await AsyncStorage.multiSet(entries);
  }

  if (removals.length > 0) {
    await AsyncStorage.multiRemove(removals);
  }

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
  ]);
};

export const restoreSession = async (): Promise<PersistedSession | null> => {
  const [[, storedToken], [, storedRefreshToken], [, userJson], [, lockValue]] =
    await AsyncStorage.multiGet([
      AUTH_STORAGE_KEYS.token,
      AUTH_STORAGE_KEYS.refreshToken,
      AUTH_STORAGE_KEYS.userProfile,
      AUTH_STORAGE_KEYS.sessionLock,
    ]);

  const token = storedToken && storedToken.length > 0 ? storedToken : undefined;
  const refreshToken =
    storedRefreshToken && storedRefreshToken.length > 0
      ? storedRefreshToken
      : undefined;

  if (!token && !userJson) {
    return null;
  }

  let user: AuthUser | null = null;

  if (userJson) {
    try {
      user = JSON.parse(userJson) as AuthUser;
    } catch (error) {
      user = null;
    }
  }

  return {
    token,
    refreshToken,
    user,
    locked: lockValue === 'locked',
  };
};

export const validateToken = async (token?: string): Promise<boolean> => {
  if (!token) {
    return true;
  }

  try {
    const response = await fetchWithRouteFallback(
      WORDPRESS_CONFIG.endpoints.profile,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    );

    return response.ok;
  } catch (error) {
    return false;
  }
};

export const refreshPersistedUserProfile = async (
  token?: string,
): Promise<AuthUser | null> => {
  if (!token) {
    return null;
  }

  const profile = await fetchUserProfile(token);
  if (!profile) {
    return null;
  }

  await AsyncStorage.setItem(
    AUTH_STORAGE_KEYS.userProfile,
    JSON.stringify(profile),
  );
  return profile;
};

export const ensureValidSession =
  async (): Promise<PersistedSession | null> => {
    const session = await restoreSession();
    if (!session) {
      return null;
    }

    if (!session.token) {
      if (!session.user) {
        await clearSession();
        return null;
      }

      return session;
    }

    const isValid = await validateToken(session.token);
    if (!isValid) {
      await clearSession();
      return null;
    }

    if (!session.user) {
      const refreshedUser = await refreshPersistedUserProfile(session.token);
      return {
        ...session,
        user: refreshedUser,
      };
    }

    return session;
  };

export const loginWithPassword = async ({
  username,
  password,
}: LoginOptions): Promise<PersistedSession> => {
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
        mode: 'token',
      }),
    },
  );

  let json: GnPasswordLoginResponse;
  try {
    json = (await response.json()) as GnPasswordLoginResponse;
  } catch (error) {
    throw new Error('Unable to log in with WordPress credentials.');
  }

  if (!json || typeof json !== 'object') {
    throw new Error('Unable to log in with WordPress credentials.');
  }

  if (!response.ok || json.success !== true) {
    const message =
      typeof json?.message === 'string' && json.message.trim().length > 0
        ? sanitizeErrorMessage(json.message)
        : 'Unable to log in with WordPress credentials.';
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
      membership: null,
    };
  }

  const token =
    typeof json.token === 'string' && json.token.trim().length > 0
      ? json.token
      : undefined;

  const session: PersistedSession = {
    token,
    user,
    locked: false,
  };

  await storeSession(session);
  await markPasswordAuthenticated();

  return session;
};

export const updatePassword = async ({
  token,
  currentPassword,
  newPassword,
  confirmPassword,
}: {
  token: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}): Promise<void> => {
  const trimmedCurrent = currentPassword.trim();
  const trimmedNew = newPassword.trim();
  const trimmedConfirm = (confirmPassword ?? newPassword).trim();

  if (!trimmedCurrent || !trimmedNew) {
    throw new Error('Unable to change password.');
  }

  const response = await fetchWithRouteFallback(
    WORDPRESS_CONFIG.endpoints.changePassword,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
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
  const payload: Record<string, string> = {
    username: options.username.trim(),
    email: options.email.trim(),
    password: options.password,
  };

  if (!payload.username || !payload.email || !payload.password) {
    throw new Error('Unable to register a new account.');
  }

  if (options.firstName) {
    payload.first_name = options.firstName.trim();
  }

  if (options.lastName) {
    payload.last_name = options.lastName.trim();
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
