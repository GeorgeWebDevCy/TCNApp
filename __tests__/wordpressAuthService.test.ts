import AsyncStorage from '@react-native-async-storage/async-storage';

import { loginWithPassword } from '../src/services/wordpressAuthService';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const createJsonResponse = (status: number, body: unknown): Response => {
  const json = jest.fn(async () => body);
  return {
    status,
    ok: status >= 200 && status < 300,
    json,
    clone: () => createJsonResponse(status, body),
  } as unknown as Response;
};

describe('wordpressAuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retries WordPress requests using rest_route when the GN Password Login API route is missing', async () => {
    const loginResponseBody = {
      success: true,
      mode: 'token',
      token: 'token-value',
      user: {
        id: 42,
        email: 'member@example.com',
        display: 'Member Example',
      },
    };

    const fetchMock = jest.fn().mockResolvedValue(createJsonResponse(500, {}));

    fetchMock
      .mockResolvedValueOnce(createJsonResponse(404, { code: 'rest_no_route' }))
      .mockResolvedValueOnce(createJsonResponse(200, loginResponseBody));

    global.fetch = fetchMock as unknown as typeof fetch;

    await loginWithPassword({ username: 'member', password: 'passw0rd' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://dominicb72.sg-host.com/wp-json/gn/v1/login',
      expect.objectContaining({ method: 'POST' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://dominicb72.sg-host.com/?rest_route=/gn/v1/login',
      expect.objectContaining({ method: 'POST' }),
    );

    expect(AsyncStorage.multiSet).toHaveBeenCalledWith(
      expect.arrayContaining([
        [
          '@tcnapp/user-profile',
          JSON.stringify({ id: 42, email: 'member@example.com', name: 'Member Example', membership: null }),
        ],
      ]),
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
