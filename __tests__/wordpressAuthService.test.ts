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

  it('retries WordPress requests using rest_route when a route is missing', async () => {
    const tokenResponseBody = {
      access_token: 'token-value',
      refresh_token: 'refresh-value',
    };

    const profileResponseBody = {
      id: 42,
      email: 'member@example.com',
      name: 'Member Example',
    };

    const fetchMock = jest.fn().mockResolvedValue(createJsonResponse(500, {}));

    fetchMock
      .mockResolvedValueOnce(createJsonResponse(404, { code: 'rest_no_route' }))
      .mockResolvedValueOnce(createJsonResponse(200, tokenResponseBody))
      .mockResolvedValueOnce(createJsonResponse(404, { code: 'rest_no_route' }))
      .mockResolvedValueOnce(createJsonResponse(200, profileResponseBody));

    global.fetch = fetchMock as unknown as typeof fetch;

    await loginWithPassword({ username: 'member', password: 'passw0rd' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://dominicb72.sg-host.com/oauth/token',
      expect.objectContaining({ method: 'POST' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://dominicb72.sg-host.com/?rest_route=/oauth/token',
      expect.objectContaining({ method: 'POST' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://dominicb72.sg-host.com/?rest_route=/wp/v2/users/me',
      expect.objectContaining({ method: 'GET' }),
    );

    expect(AsyncStorage.multiSet).toHaveBeenCalled();
  });
});
