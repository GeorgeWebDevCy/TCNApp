import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_STORAGE_KEYS, WORDPRESS_CONFIG } from '../config/authConfig';
import {
  AuthUser,
  LoginOptions,
  MembershipBenefit,
  MembershipInfo,
  WordPressTokenResponse,
} from '../types/auth';

export interface PersistedSession {
  token: string;
  refreshToken?: string;
  user: AuthUser | null;
  locked: boolean;
}

const buildUrl = (path: string) => `${WORDPRESS_CONFIG.baseUrl}${path}`;

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

const parseUserFromToken = (
  tokenResponse: WordPressTokenResponse,
): AuthUser | null => {
  if (!tokenResponse.user_email) {
    return null;
  }

  return {
    id: -1,
    email: tokenResponse.user_email,
    name: tokenResponse.user_display_name ?? tokenResponse.user_email,
    membership: null,
  };
};

const fetchUserProfile = async (token: string): Promise<AuthUser | null> => {
  try {
    const response = await fetch(buildUrl(WORDPRESS_CONFIG.endpoints.profile), {
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
  const entries: [string, string][] = [[AUTH_STORAGE_KEYS.token, token]];

  if (refreshToken) {
    entries.push([AUTH_STORAGE_KEYS.refreshToken, refreshToken]);
  }

  if (user) {
    entries.push([AUTH_STORAGE_KEYS.userProfile, JSON.stringify(user)]);
  }

  await AsyncStorage.multiSet(entries);
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
  const [[, token], [, refreshToken], [, userJson], [, lockValue]] = await AsyncStorage.multiGet([
    AUTH_STORAGE_KEYS.token,
    AUTH_STORAGE_KEYS.refreshToken,
    AUTH_STORAGE_KEYS.userProfile,
    AUTH_STORAGE_KEYS.sessionLock,
  ]);

  if (!token) {
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
    refreshToken: refreshToken ?? undefined,
    user,
    locked: lockValue === 'locked',
  };
};

export const validateToken = async (token: string): Promise<boolean> => {
  try {
    const response = await fetch(buildUrl(WORDPRESS_CONFIG.endpoints.validate), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    return response.ok;
  } catch (error) {
    return false;
  }
};

export const refreshPersistedUserProfile = async (
  token: string,
): Promise<AuthUser | null> => {
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
  const response = await fetch(buildUrl(WORDPRESS_CONFIG.endpoints.token), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  const json = (await response.json()) as WordPressTokenResponse & {
    message?: string;
    data?: { status?: number };
  };

  if (!response.ok) {
    const message = json?.message ?? 'Unable to log in with WordPress credentials.';
    throw new Error(message);
  }

  const userFromToken = parseUserFromToken(json);
  const profile = await fetchUserProfile(json.token);
  const user = profile ?? userFromToken;

  const session: PersistedSession = {
    token: json.token,
    refreshToken: json.refresh_token,
    user,
    locked: false,
  };

  await storeSession(session);
  await markPasswordAuthenticated();

  return session;
};
