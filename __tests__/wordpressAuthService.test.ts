import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';

import { AUTH_STORAGE_KEYS, WORDPRESS_CONFIG } from '../src/config/authConfig';
import {
  __unsafeResetBearerTokenCacheForTests,
  __unsafeResetWordPressCookieCacheForTests,
  __unsafeResetWooCommerceAuthHeaderCacheForTests,
  clearStoredWordPressCookies,
  clearStoredWooCommerceAuthHeader,
} from '../src/services/wordpressCookieService';
import {
  loginWithPassword,
  registerAccount,
  updatePassword,
  deleteProfileAvatar,
  ensureMemberQrCode,
  validateMemberQrCode,
  ensureValidSession,
} from '../src/services/wordpressAuthService';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../src/services/activityMonitorService', () => ({
  enqueueActivityLog: jest.fn(),
}));

const createJsonResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response => {
  const json = jest.fn(async () => body);
  const headerEntries = Object.entries(headers);
  const headerLookup = headerEntries.reduce<Record<string, string>>(
    (accumulator, [key, value]) => {
      accumulator[key.toLowerCase()] = value;
      return accumulator;
    },
    {},
  );

  return {
    status,
    ok: status >= 200 && status < 300,
    json,
    clone: () => createJsonResponse(status, body, headers),
    headers: {
      get: (name: string) => headerLookup[name.toLowerCase()] ?? null,
    } as unknown as Headers,
  } as unknown as Response;
};

describe('wordpressAuthService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearStoredWordPressCookies();
    await clearStoredWooCommerceAuthHeader();
    __unsafeResetBearerTokenCacheForTests();
    __unsafeResetWordPressCookieCacheForTests();
    __unsafeResetWooCommerceAuthHeaderCacheForTests();
    if (typeof EncryptedStorage.clear === 'function') {
      await EncryptedStorage.clear();
    }
  });

  it('retries WordPress requests using rest_route when the JWT token route is missing', async () => {
    const loginResponseBody = {
      token: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijkl',
      user_email: 'member@example.com',
      user_display_name: 'Member Example',
    };

    const profileResponseBody = {
      id: 42,
      email: 'member@example.com',
      name: 'Member Example',
      avatar_urls: {},
    };

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(404, { code: 'rest_no_route' }))
      .mockResolvedValueOnce(createJsonResponse(200, loginResponseBody))
      .mockResolvedValueOnce(createJsonResponse(200, profileResponseBody));

    global.fetch = fetchMock as unknown as typeof fetch;

    await loginWithPassword({
      email: 'member@example.com',
      password: 'passw0rd',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.passwordLogin}`,
      expect.objectContaining({ method: 'POST' }),
    );

    const restRoutePath = WORDPRESS_CONFIG.endpoints.passwordLogin.replace(
      /^\/wp-json/,
      '',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${WORDPRESS_CONFIG.baseUrl}/?rest_route=${restRoutePath}`,
      expect.objectContaining({ method: 'POST' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.profile}`,
      expect.objectContaining({ method: 'GET' }),
    );

    expect(AsyncStorage.multiSet).toHaveBeenCalledWith(
      expect.arrayContaining([
        [
          AUTH_STORAGE_KEYS.userProfile,
          expect.stringMatching(
            /^(?=.*member@example\.com)(?=.*Member Example).*/,
          ),
        ],
      ]),
    );
  });

  it('sanitizes HTML error responses from WordPress before surfacing them to the user', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse(401, {
        code: 'jwt_auth_invalid_credentials',
        message:
          '<p>There has been a critical error on this website.</p><p><a href="https://wordpress.org/documentation/article/faq-troubleshooting/">Learn more about troubleshooting WordPress.</a></p>',
      }),
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      loginWithPassword({
        email: 'member@example.com',
        password: 'bad-password',
      }),
    ).rejects.toThrow(
      'There has been a critical error on this website. Learn more about troubleshooting WordPress.',
    );
  });

  it('persists the avatar URL returned by the WordPress profile endpoint', async () => {
    const loginResponseBody = {
      token: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijkl',
      user_email: 'member@example.com',
      user_display_name: 'Member Example',
    };

    const profileResponseBody = {
      id: 42,
      email: 'member@example.com',
      name: 'Member Example',
      avatar_urls: {
        '96': 'https://example.com/uploads/avatar-96x96.jpg',
      },
    };

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, loginResponseBody))
      .mockResolvedValueOnce(createJsonResponse(200, profileResponseBody));

    global.fetch = fetchMock as unknown as typeof fetch;

    const session = await loginWithPassword({
      email: 'member@example.com',
      password: 'passw0rd',
    });

    expect(session.user?.avatarUrl).toContain('avatar-96x96.jpg');

    const storedProfile = await AsyncStorage.getItem(
      AUTH_STORAGE_KEYS.userProfile,
    );
    expect(storedProfile).not.toBeNull();
    expect(JSON.parse(storedProfile as string)).toEqual(session.user);
  });

  it('applies the API token authorization header to subsequent requests after login', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          200,
          {
            token: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijkl',
            user_email: 'member@example.com',
            user_display_name: 'Member Example',
          },
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          id: 42,
          email: 'member@example.com',
          name: 'Member Example',
          avatar_urls: {},
        }),
      )
      .mockResolvedValueOnce(createJsonResponse(200, { success: true }));

    global.fetch = fetchMock as unknown as typeof fetch;

    await loginWithPassword({
      email: 'member@example.com',
      password: 'passw0rd',
    });

    await registerAccount({
      username: 'newmember',
      email: 'newmember@example.com',
      password: 'aSecurePassword123',
      accountType: 'member',
    });

    const registerRequestInit = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(registerRequestInit?.headers).toEqual(
      expect.objectContaining({
        Authorization:
          'Bearer ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijkl',
      }),
    );
  });

  it('prefers the JWT bearer token when the login response also includes an API token', async () => {
    const jwtToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjB9.abc123signature';
    const apiToken = 'opaque-api-token-value-1234567890';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          token: jwtToken,
          api_token: apiToken,
          user_email: 'member@example.com',
          user_display_name: 'Member Example',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          id: 42,
          email: 'member@example.com',
          name: 'Member Example',
          avatar_urls: {},
        }),
      )
      .mockResolvedValueOnce(createJsonResponse(200, { success: true }));

    global.fetch = fetchMock as unknown as typeof fetch;

    await loginWithPassword({
      email: 'member@example.com',
      password: 'passw0rd',
    });

    await registerAccount({
      username: 'newmember',
      email: 'newmember@example.com',
      password: 'aSecurePassword123',
      accountType: 'member',
    });

    const registerRequestInit = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(registerRequestInit?.headers).toEqual(
      expect.objectContaining({
        Authorization: `Bearer ${jwtToken}`,
        'X-Authorization': `Bearer ${jwtToken}`,
      }),
    );
  });

  it('removes the avatar and refreshes the cached profile when deletion succeeds', async () => {
    const loginFetch = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          token: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijkl',
          user_email: 'member@example.com',
          user_display_name: 'Member Example',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          id: 42,
          email: 'member@example.com',
          name: 'Member Example',
          avatar_urls: {
            '96': 'https://example.com/uploads/custom-avatar.jpg',
          },
        }),
      );

    global.fetch = loginFetch as unknown as typeof fetch;
    await loginWithPassword({
      email: 'member@example.com',
      password: 'passw0rd',
    });

    const deleteFetch = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(204, null))
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          id: 42,
          email: 'member@example.com',
          name: 'Member Example',
          avatar_urls: {
            '96': 'https://example.com/uploads/default-avatar.jpg',
          },
        }),
      );

    global.fetch = deleteFetch as unknown as typeof fetch;

    const updatedUser = await deleteProfileAvatar();

    expect(deleteFetch).toHaveBeenNthCalledWith(
      1,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.profileAvatar}`,
      expect.objectContaining({
        method: 'DELETE',
      }),
    );

    expect(deleteFetch).toHaveBeenNthCalledWith(
      2,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.profile}`,
      expect.objectContaining({
        method: 'GET',
      }),
    );

    expect(updatedUser.avatarUrl).toContain('default-avatar.jpg');

    const storedProfile = await AsyncStorage.getItem(
      AUTH_STORAGE_KEYS.userProfile,
    );
    expect(storedProfile).not.toBeNull();
    expect(JSON.parse(storedProfile as string)).toEqual(updatedUser);
  });

  it('extracts API tokens from token login URLs and persists token login metadata', async () => {
    const apiToken = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijkl';
    const tokenLoginUrl =
      'https://example.com/wp-login.php?action=gn_token_login&token=' +
      encodeURIComponent(apiToken) +
      '&redirect_to=https%3A%2F%2Fexample.com%2Fapp';

    const loginResponseBody = {
      token: tokenLoginUrl,
      token_login_url: tokenLoginUrl,
      rest_nonce: 'rest-nonce-value',
      user: {
        id: 55,
        email: 'member@example.com',
        display: 'Member Example',
        first_name: 'Member',
        last_name: 'Example',
      },
    };

    const profileResponseBody = {
      id: 55,
      email: 'member@example.com',
      name: 'Member Example',
      avatar_urls: {},
    };

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, loginResponseBody))
      .mockResolvedValueOnce(createJsonResponse(200, profileResponseBody));

    global.fetch = fetchMock as unknown as typeof fetch;

    await loginWithPassword({
      email: 'member@example.com',
      password: 'passw0rd',
      mode: 'token',
      remember: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.passwordLogin}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          username: 'member@example.com',
          password: 'passw0rd',
          mode: 'token',
          remember: true,
        }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.profile}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${apiToken}`,
        }),
      }),
    );

    expect(EncryptedStorage.setItem).toHaveBeenCalledWith(
      AUTH_STORAGE_KEYS.token,
      apiToken,
    );

    expect(AsyncStorage.multiSet).toHaveBeenCalledWith(
      expect.arrayContaining([
        [AUTH_STORAGE_KEYS.tokenLoginUrl, tokenLoginUrl],
        [AUTH_STORAGE_KEYS.wpRestNonce, 'rest-nonce-value'],
        [
          AUTH_STORAGE_KEYS.userProfile,
          expect.stringContaining('Member Example'),
        ],
      ]),
    );

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      AUTH_STORAGE_KEYS.passwordAuthenticated,
      'true',
    );
  });

  it('falls back to extracting the API token from token_login_url when no token field is returned', async () => {
    const apiToken = 'abcdefghijklmnopqrstuvwxyz0123456789TOKENVALUE';
    const tokenLoginUrl =
      'https://example.com/wp-login.php?action=gn_token_login&token=' +
      encodeURIComponent(apiToken) +
      '&redirect_to=https%3A%2F%2Fexample.com%2Fapp';

    const loginResponseBody = {
      token: null,
      token_login_url: tokenLoginUrl,
      rest_nonce: 'rest-nonce-value',
      user: {
        id: 42,
        email: 'member@example.com',
        display: 'Member Example',
        first_name: 'Member',
        last_name: 'Example',
      },
    };

    const profileResponseBody = {
      id: 42,
      email: 'member@example.com',
      name: 'Member Example',
      avatar_urls: {},
    };

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, loginResponseBody))
      .mockResolvedValueOnce(createJsonResponse(200, profileResponseBody));

    global.fetch = fetchMock as unknown as typeof fetch;

    await loginWithPassword({
      email: 'member@example.com',
      password: 'passw0rd',
      remember: false,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.profile}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${apiToken}`,
        }),
      }),
    );

    expect(EncryptedStorage.setItem).toHaveBeenCalledWith(
      AUTH_STORAGE_KEYS.token,
      apiToken,
    );

    expect(AsyncStorage.multiSet).toHaveBeenCalledWith(
      expect.arrayContaining([
        [AUTH_STORAGE_KEYS.token, apiToken],
        [AUTH_STORAGE_KEYS.tokenLoginUrl, tokenLoginUrl],
      ]),
    );
  });

  it('re-authenticates using stored credentials when a restored session has no token', async () => {
    const storedUser = {
      id: 99,
      email: 'member@example.com',
      name: 'Member Example',
      firstName: 'Member',
      lastName: 'Example',
      membership: null,
      membershipBenefits: [],
      woocommerceCredentials: null,
      accountType: null,
      accountStatus: null,
      vendorTier: null,
      vendorStatus: null,
      qrPayload: null,
      qrToken: null,
    };

    await AsyncStorage.setItem(
      AUTH_STORAGE_KEYS.userProfile,
      JSON.stringify(storedUser),
    );
    await EncryptedStorage.setItem(
      AUTH_STORAGE_KEYS.credentialEmail,
      'member@example.com',
    );
    await EncryptedStorage.setItem(
      AUTH_STORAGE_KEYS.credentialPassword,
      'passw0rd',
    );

    const apiToken = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijkl';

    const loginResponseBody = {
      token: apiToken,
      user_email: 'member@example.com',
      user_display_name: 'Member Example',
    };

    const profileResponseBody = {
      id: 99,
      email: 'member@example.com',
      name: 'Member Example',
      avatar_urls: {},
    };

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, loginResponseBody))
      .mockResolvedValueOnce(createJsonResponse(200, profileResponseBody));

    global.fetch = fetchMock as unknown as typeof fetch;

    const session = await ensureValidSession();

    expect(session).not.toBeNull();
    expect(session?.token).toBe(apiToken);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.passwordLogin}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          username: 'member@example.com',
          password: 'passw0rd',
          remember: true,
        }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.profile}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${apiToken}`,
        }),
      }),
    );

    expect(await EncryptedStorage.getItem(AUTH_STORAGE_KEYS.token)).toBe(
      apiToken,
    );

    expect(AsyncStorage.multiSet).toHaveBeenCalledWith(
      expect.arrayContaining([[AUTH_STORAGE_KEYS.token, apiToken]]),
    );
  });

  it('refreshes the stored API token and expiration when validation returns 401', async () => {
    const storedUser = {
      id: 101,
      email: 'refresh@example.com',
      name: 'Refresh Example',
      firstName: 'Refresh',
      lastName: 'Example',
      membership: null,
      membershipBenefits: [],
      woocommerceCredentials: null,
      accountType: null,
      accountStatus: null,
      vendorTier: null,
      vendorStatus: null,
      qrPayload: null,
      qrToken: null,
    };

    const expiredToken = 'expiredToken1234567890';
    const refreshedToken = 'refreshedToken0987654321';

    await EncryptedStorage.setItem(AUTH_STORAGE_KEYS.token, expiredToken);
    await AsyncStorage.setItem(AUTH_STORAGE_KEYS.token, expiredToken);
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEYS.userProfile,
      JSON.stringify(storedUser),
    );

    const profileUnauthorized = createJsonResponse(401, {
      code: 'jwt_auth_invalid_token',
    });
    const refreshResponse = createJsonResponse(200, {
      token: refreshedToken,
      expires_in: 3600,
    });
    const profileResponse = createJsonResponse(200, {
      id: storedUser.id,
      email: storedUser.email,
      name: storedUser.name,
      avatar_urls: {},
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(profileUnauthorized)
      .mockResolvedValueOnce(refreshResponse)
      .mockResolvedValueOnce(profileResponse);

    global.fetch = fetchMock as unknown as typeof fetch;

    const session = await ensureValidSession();

    expect(session?.token).toBe(refreshedToken);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.refreshToken}`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${expiredToken}`,
        }),
      }),
    );

    expect(await EncryptedStorage.getItem(AUTH_STORAGE_KEYS.token)).toBe(
      refreshedToken,
    );

    const storedExpiry = await AsyncStorage.getItem(
      AUTH_STORAGE_KEYS.tokenExpiresAt,
    );
    expect(storedExpiry).not.toBeNull();
    const parsedExpiry = Date.parse(storedExpiry as string);
    expect(Number.isNaN(parsedExpiry)).toBe(false);
    expect(parsedExpiry).toBeGreaterThan(Date.now());
  });

  it('preemptively refreshes expired bearer tokens during bootstrap', async () => {
    const storedUser = {
      id: 202,
      email: 'expired@example.com',
      name: 'Expired Example',
      firstName: 'Expired',
      lastName: 'Example',
      membership: null,
      membershipBenefits: [],
      woocommerceCredentials: null,
      accountType: null,
      accountStatus: null,
      vendorTier: null,
      vendorStatus: null,
      qrPayload: null,
      qrToken: null,
    };

    const expiredToken = 'expiredToken.bootstrap.123456';
    const refreshedToken = 'refreshedToken.bootstrap.654321';
    const pastExpiry = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await EncryptedStorage.setItem(AUTH_STORAGE_KEYS.token, expiredToken);
    await AsyncStorage.setItem(AUTH_STORAGE_KEYS.token, expiredToken);
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEYS.userProfile,
      JSON.stringify(storedUser),
    );
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEYS.tokenExpiresAt,
      pastExpiry,
    );

    const refreshResponse = createJsonResponse(200, {
      token: refreshedToken,
      expires_in: 3600,
    });
    const profileResponse = createJsonResponse(200, {
      id: storedUser.id,
      email: storedUser.email,
      name: storedUser.name,
      avatar_urls: {},
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(refreshResponse)
      .mockResolvedValueOnce(profileResponse);

    global.fetch = fetchMock as unknown as typeof fetch;

    const session = await ensureValidSession();

    expect(session?.token).toBe(refreshedToken);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.refreshToken}`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${expiredToken}`,
        }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.profile}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${refreshedToken}`,
        }),
      }),
    );

    expect(await EncryptedStorage.getItem(AUTH_STORAGE_KEYS.token)).toBe(
      refreshedToken,
    );

    const storedExpiry = await AsyncStorage.getItem(
      AUTH_STORAGE_KEYS.tokenExpiresAt,
    );
    expect(storedExpiry).not.toBeNull();
    const parsedExpiry = Date.parse(storedExpiry as string);
    expect(Number.isNaN(parsedExpiry)).toBe(false);
    expect(parsedExpiry).toBeGreaterThan(Date.now());
  });

  it('retries credential-based login when refresh fails during bootstrap', async () => {
    const storedUser = {
      id: 303,
      email: 'fallback@example.com',
      name: 'Fallback Example',
      firstName: 'Fallback',
      lastName: 'Example',
      membership: null,
      membershipBenefits: [],
      woocommerceCredentials: null,
      accountType: null,
      accountStatus: null,
      vendorTier: null,
      vendorStatus: null,
      qrPayload: null,
      qrToken: null,
    };

    const expiredToken = 'expiredToken.bootstrap.abcdef';
    const refreshedToken = 'fallbackToken.bootstrap.fedcba';
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await EncryptedStorage.setItem(AUTH_STORAGE_KEYS.token, expiredToken);
    await AsyncStorage.setItem(AUTH_STORAGE_KEYS.token, expiredToken);
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEYS.userProfile,
      JSON.stringify(storedUser),
    );
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEYS.tokenExpiresAt,
      futureExpiry,
    );
    await EncryptedStorage.setItem(
      AUTH_STORAGE_KEYS.credentialEmail,
      'fallback@example.com',
    );
    await EncryptedStorage.setItem(
      AUTH_STORAGE_KEYS.credentialPassword,
      'pa55word!',
    );

    const profileUnauthorized = createJsonResponse(401, {
      code: 'jwt_auth_invalid_token',
    });
    const refreshFailure = createJsonResponse(500, {
      code: 'jwt_auth_bad_token',
    });
    const loginResponseBody = {
      token: refreshedToken,
      user_email: 'fallback@example.com',
      user_display_name: 'Fallback Example',
    };
    const profileResponseBody = {
      id: storedUser.id,
      email: storedUser.email,
      name: storedUser.name,
      avatar_urls: {},
    };

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(profileUnauthorized)
      .mockResolvedValueOnce(refreshFailure)
      .mockResolvedValueOnce(createJsonResponse(200, loginResponseBody))
      .mockResolvedValueOnce(createJsonResponse(200, profileResponseBody));

    global.fetch = fetchMock as unknown as typeof fetch;

    const session = await ensureValidSession();

    expect(session?.token).toBe(refreshedToken);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.profile}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${expiredToken}`,
        }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.refreshToken}`,
      expect.objectContaining({ method: 'POST' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.passwordLogin}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          username: 'fallback@example.com',
          password: 'pa55word!',
          remember: true,
        }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.profile}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${refreshedToken}`,
        }),
      }),
    );

    expect(await EncryptedStorage.getItem(AUTH_STORAGE_KEYS.token)).toBe(
      refreshedToken,
    );
  });

  it('sends membership metadata when registering a new account so the blue plan is auto-purchased', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-02-01T10:00:00.000Z'));

    const fetchMock = jest
      .fn()
      .mockResolvedValue(createJsonResponse(200, { success: true }));

    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      await registerAccount({
        username: 'newmember',
        email: 'newmember@example.com',
        password: 'aSecurePassword123',
        accountType: 'member',
      });
    } finally {
      jest.useRealTimers();
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse((requestInit?.body as string) ?? '{}');

    expect(body.create_membership_order).toBe(true);
    expect(body.membership_status).toBe('active');
    expect(body.membership_purchase_date).toBe('2024-02-01T10:00:00.000Z');
    expect(body.membership_subscription_date).toBe('2024-02-01T10:00:00.000Z');
    expect(body.role).toBe('customer');
    expect(body.woocommerce_customer).toEqual(
      expect.objectContaining({
        role: 'customer',
        email: 'newmember@example.com',
        username: 'newmember',
      }),
    );
    expect(body.woocommerce_customer.first_name).toBeUndefined();
    expect(body.woocommerce_customer.last_name).toBeUndefined();
    expect(body.woocommerce_customer.billing).toEqual(
      expect.objectContaining({
        email: 'newmember@example.com',
      }),
    );
    expect(body.woocommerce_customer.meta_data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'membership_tier', value: 'blue' }),
        expect.objectContaining({ key: 'membership_plan', value: 'blue-membership' }),
      ]),
    );
    expect(body.woocommerce_order).toEqual(
      expect.objectContaining({
        status: 'completed',
        set_paid: true,
        payment_method: 'app_membership_auto',
        payment_method_title: 'TCN App Membership',
        date_created_gmt: '2024-02-01T10:00:00.000Z',
        date_paid_gmt: '2024-02-01T10:00:00.000Z',
      }),
    );
    expect(body.woocommerce_order.billing).toEqual(
      expect.objectContaining({
        email: 'newmember@example.com',
      }),
    );
    expect(body.woocommerce_order.line_items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_sku: 'blue-membership',
          quantity: 1,
          subtotal: '0',
          total: '0',
        }),
      ]),
    );
    expect(body.woocommerce_order.meta_data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'membership_purchase_date',
          value: '2024-02-01T10:00:00.000Z',
        }),
        expect.objectContaining({
          key: 'membership_subscription_date',
          value: '2024-02-01T10:00:00.000Z',
        }),
      ]),
    );
    expect(body.woocommerce_order.line_items[0]?.meta_data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'membership_tier', value: 'blue' }),
        expect.objectContaining({ key: 'membership_plan', value: 'blue-membership' }),
      ]),
    );
  });

  it('marks vendor registrations as pending approval without creating membership orders', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(createJsonResponse(200, { success: true }));

    global.fetch = fetchMock as unknown as typeof fetch;

    await registerAccount({
      username: 'newvendor',
      email: 'vendor@example.com',
      password: 'StrongPassword!2',
      accountType: 'vendor',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse((requestInit?.body as string) ?? '{}');

    expect(body.role).toBe('vendor');
    expect(body.account_status).toBe('pending');
    expect(body.vendor_status).toBe('pending');
    expect(body.membership_status).toBeUndefined();
    expect(body.woocommerce_order).toBeUndefined();
    expect(body.woocommerce_customer).toEqual(
      expect.objectContaining({
        role: 'vendor',
        email: 'vendor@example.com',
        username: 'newvendor',
      }),
    );
  });

  it('attaches WooCommerce REST API credentials when calling WooCommerce endpoints', async () => {
    const originalRegisterEndpoint = WORDPRESS_CONFIG.endpoints.register;
    const originalConsumerKey = WORDPRESS_CONFIG.woocommerce.consumerKey;
    const originalConsumerSecret = WORDPRESS_CONFIG.woocommerce.consumerSecret;

    WORDPRESS_CONFIG.endpoints.register = '/wp-json/wc/v3/customers';
    WORDPRESS_CONFIG.woocommerce.consumerKey = 'ck_test_consumer_key';
    WORDPRESS_CONFIG.woocommerce.consumerSecret = 'cs_test_consumer_secret';

    const fetchMock = jest
      .fn()
      .mockResolvedValue(createJsonResponse(200, { success: true }));

    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      await registerAccount({
        username: 'woo-member',
        email: 'woo-member@example.com',
        password: 'aSecurePassword123',
        accountType: 'member',
      });
    } finally {
      WORDPRESS_CONFIG.endpoints.register = originalRegisterEndpoint;
      WORDPRESS_CONFIG.woocommerce.consumerKey = originalConsumerKey;
      WORDPRESS_CONFIG.woocommerce.consumerSecret = originalConsumerSecret;
    }

    const requestUrl = fetchMock.mock.calls[0]?.[0] as string;

    expect(requestUrl).toContain(
      `consumer_key=${encodeURIComponent('ck_test_consumer_key')}`,
    );
    expect(requestUrl).toContain(
      `consumer_secret=${encodeURIComponent('cs_test_consumer_secret')}`,
    );
  });

  it('falls back to the SQL password change endpoint when the REST endpoint fails', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(500, {
          success: false,
          message: 'REST endpoint unavailable',
        }),
      )
      .mockResolvedValueOnce(createJsonResponse(200, { success: true }))
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          id: 7,
          email: 'member@example.com',
          name: 'Member Example',
          avatar_urls: {},
        }),
      );

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      updatePassword({
        token: 'token-value',
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass456!',
        tokenLoginUrl: null,
        restNonce: null,
      }),
    ).rejects.toThrow('REST endpoint unavailable');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.changePassword}`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns null when ensuring a member QR code without a token', async () => {
    await expect(ensureMemberQrCode({ token: null })).resolves.toBeNull();
    await expect(ensureMemberQrCode({ token: '' })).resolves.toBeNull();
  });

  it('requests and parses a member QR code when a token is provided', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        createJsonResponse(200, {
          token: 'qr-123',
          payload: 'payload-xyz',
          issued_at: '2024-01-02T03:04:05.000Z',
          expires_at: '2024-02-02T03:04:05.000Z',
        }),
      );

    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await ensureMemberQrCode({
      token: 'member-token',
      payload: 'fallback-payload',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.membershipQr}`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer member-token',
        }),
      }),
    );

    expect(result).toEqual({
      token: 'qr-123',
      payload: 'payload-xyz',
      issuedAt: '2024-01-02T03:04:05.000Z',
      expiresAt: '2024-02-02T03:04:05.000Z',
    });
  });

  it('requires a QR token when validating membership', async () => {
    await expect(validateMemberQrCode('', 'auth-token')).resolves.toEqual({
      token: '',
      valid: false,
      message: 'QR token is required.',
    });
  });

  it('validates a member QR token and returns membership details', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        createJsonResponse(200, {
          valid: true,
          member_name: 'Alex Member',
          membership_tier: 'Gold',
          allowed_discount: 12.5,
        }),
      );

    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await validateMemberQrCode('qr-123', 'member-token');

    expect(fetchMock).toHaveBeenCalledWith(
      `${WORDPRESS_CONFIG.baseUrl}${WORDPRESS_CONFIG.endpoints.validateQr}`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer member-token',
        }),
        body: JSON.stringify({ token: 'qr-123' }),
      }),
    );

    expect(result).toEqual({
      token: 'qr-123',
      valid: true,
      memberName: 'Alex Member',
      membershipTier: 'Gold',
      allowedDiscount: 12.5,
      membership: null,
      message: null,
    });
  });
});
