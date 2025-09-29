import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_STORAGE_KEYS, WORDPRESS_CONFIG } from '../config/authConfig';
import { AuthUser, LoginOptions, MembershipBenefit, MembershipInfo } from '../types/auth';

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

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, '');

const ensureLeadingSlash = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

const buildUrl = (path: string) =>
  `${normalizeBaseUrl(WORDPRESS_CONFIG.baseUrl)}${ensureLeadingSlash(path)}`;

const buildRestRouteUrl = (path: string) => {
  const normalizedPath = ensureLeadingSlash(path);
  const restRoute = normalizedPath.startsWith('/wp-json')
    ? normalizedPath.slice('/wp-json'.length) || '/'
    : normalizedPath;

  return `${normalizeBaseUrl(WORDPRESS_CONFIG.baseUrl)}/?rest_route=${restRoute}`;
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
      payload && typeof payload === 'object' && 'code' in payload && payload.code === 'rest_no_route';
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

      const description = raw.description ?? raw.summary ?? raw.details ?? raw.text;
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

const parseMembershipInfo = (payload: Record<string, unknown> | null | undefined): MembershipInfo | null => {
  if (!payload) {
    return null;
  }

  const meta = (payload.meta as Record<string, unknown> | undefined) ?? undefined;
  const membershipSource = (payload.membership as Record<string, unknown> | undefined) ??
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
    const response = await fetchWithRouteFallback(WORDPRESS_CONFIG.endpoints.profile, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

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
    const nameSource = payload.name ?? payload.user_display_name ?? payload.username ?? emailSource;

    return {
      id: Number.isFinite(parsedId) ? parsedId : -1,
      email: typeof emailSource === 'string' ? emailSource : String(emailSource ?? ''),
      name: typeof nameSource === 'string' ? nameSource : String(nameSource ?? ''),
      avatarUrl: (payload.avatar_urls as Record<string, string> | undefined)?.['96'] ??
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
  const value = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.passwordAuthenticated);
  return value === 'true';
};

const storeSession = async ({ token, refreshToken, user }: Omit<PersistedSession, 'locked'>) => {
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
    storedRefreshToken && storedRefreshToken.length > 0 ? storedRefreshToken : undefined;

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
    const response = await fetchWithRouteFallback(WORDPRESS_CONFIG.endpoints.profile, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

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

  await AsyncStorage.setItem(AUTH_STORAGE_KEYS.userProfile, JSON.stringify(profile));
  return profile;
};

export const ensureValidSession = async (): Promise<PersistedSession | null> => {
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
  const response = await fetchWithRouteFallback(WORDPRESS_CONFIG.endpoints.passwordLogin, {
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
  });

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
        ? json.message
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
      (typeof payload.display === 'string' && payload.display.trim().length > 0 && payload.display) ||
      (typeof payload.nicename === 'string' && payload.nicename.trim().length > 0 && payload.nicename) ||
      (typeof payload.login === 'string' && payload.login.trim().length > 0 && payload.login) ||
      email ||
      username;

    user = {
      id: Number.isFinite(parsedId) ? parsedId : -1,
      email,
      name,
      membership: null,
    };
  }

  const session: PersistedSession = {
    user,
    locked: false,
  };

  await storeSession(session);
  await markPasswordAuthenticated();

  return session;
};
