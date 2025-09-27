import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_STORAGE_KEYS, WORDPRESS_CONFIG } from '../config/authConfig';
import { AuthUser, LoginOptions, WordPressTokenResponse } from '../types/auth';

export interface PersistedSession {
  token: string;
  refreshToken?: string;
  user: AuthUser | null;
  locked: boolean;
}

const buildUrl = (path: string) => `${WORDPRESS_CONFIG.baseUrl}${path}`;

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

    const payload = await response.json();

    return {
      id: payload.id,
      email: payload.email ?? payload.user_email ?? '',
      name: payload.name ?? payload.user_display_name ?? payload.username,
      avatarUrl: payload.avatar_urls?.['96'] ?? payload.avatar_urls?.['48'],
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
