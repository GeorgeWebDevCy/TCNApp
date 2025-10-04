import AsyncStorage from '@react-native-async-storage/async-storage';

import { AUTH_STORAGE_KEYS, WORDPRESS_CONFIG } from '../src/config/authConfig';
import {
  __unsafeResetWordPressCookieCacheForTests,
  clearStoredWordPressCookies,
} from '../src/services/wordpressCookieService';
import { loginWithPassword, registerAccount } from '../src/services/wordpressAuthService';

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
});
