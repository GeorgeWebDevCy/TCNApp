import AsyncStorage from '@react-native-async-storage/async-storage';

import { AUTH_STORAGE_KEYS, WORDPRESS_CONFIG } from '../src/config/authConfig';
import {
  __unsafeResetWordPressCookieCacheForTests,
  clearStoredWordPressCookies,
} from '../src/services/wordpressCookieService';
import { loginWithPassword } from '../src/services/wordpressAuthService';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

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
    __unsafeResetWordPressCookieCacheForTests();
  });

  it('retries WordPress requests using rest_route when the GN Password Login API route is missing', async () => {
    const loginResponseBody = {
      success: true,
      mode: 'cookie',
      token: 'token-value',
      user: {
        id: 42,
        email: 'member@example.com',
        display: 'Member Example',
      },
    };
    const setCookieHeader =
      'wordpress_logged_in_hash=logged-in; path=/; secure; httponly, wordpress_sec_hash=secure; path=/; secure; httponly';

    const fetchMock = jest.fn().mockResolvedValue(createJsonResponse(500, {}));

    fetchMock
      .mockResolvedValueOnce(createJsonResponse(404, { code: 'rest_no_route' }))
      .mockResolvedValueOnce(
        createJsonResponse(200, loginResponseBody, {
          'set-cookie': setCookieHeader,
        }),
      );

    global.fetch = fetchMock as unknown as typeof fetch;

    await loginWithPassword({ username: 'member', password: 'passw0rd' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${WORDPRESS_CONFIG.baseUrl}/wp-json/gn/v1/login`,
      expect.objectContaining({ method: 'POST' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${WORDPRESS_CONFIG.baseUrl}/?rest_route=/gn/v1/login`,
      expect.objectContaining({ method: 'POST' }),
    );

    expect(AsyncStorage.multiSet).toHaveBeenCalledWith(
      expect.arrayContaining([
        [
          '@tcnapp/user-profile',
          JSON.stringify({
            id: 42,
            email: 'member@example.com',
            name: 'Member Example',
            membership: null,
          }),
        ],
      ]),
    );

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      AUTH_STORAGE_KEYS.wordpressCookies,
      expect.stringContaining('wordpress_logged_in_hash=logged-in'),
    );
  });

  it('sanitizes HTML error responses from WordPress before surfacing them to the user', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse(500, {
        success: false,
        message:
          '<p>There has been a critical error on this website.</p><p><a href="https://wordpress.org/documentation/article/faq-troubleshooting/">Learn more about troubleshooting WordPress.</a></p>',
      }),
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      loginWithPassword({ username: 'member', password: 'bad-password' }),
    ).rejects.toThrow(
      'There has been a critical error on this website. Learn more about troubleshooting WordPress.',
    );
  });
});
