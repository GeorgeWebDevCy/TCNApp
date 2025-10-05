import AsyncStorage from '@react-native-async-storage/async-storage';

import { AUTH_STORAGE_KEYS, WORDPRESS_CONFIG } from '../src/config/authConfig';
import {
  __unsafeResetWordPressCookieCacheForTests,
  __unsafeResetWooCommerceAuthHeaderCacheForTests,
  clearStoredWordPressCookies,
  clearStoredWooCommerceAuthHeader,
} from '../src/services/wordpressCookieService';
import {
  loginWithPassword,
  registerAccount,
  updatePassword,
} from '../src/services/wordpressAuthService';

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
    await clearStoredWooCommerceAuthHeader();
    __unsafeResetWordPressCookieCacheForTests();
    __unsafeResetWooCommerceAuthHeaderCacheForTests();
  });

  it('retries WordPress requests using rest_route when the GN Password Login API route is missing', async () => {
    const loginResponseBody = {
      success: true,
      mode: 'cookie',
      api_token: 'api-token-value',
      token: 'token-value',
      user: {
        id: 42,
        email: 'member@example.com',
        display: 'Member Example',
        woocommerce: {
          consumer_key: 'ck_live_value',
          consumer_secret: 'cs_live_value',
          basic_auth: 'Basic Y2tfbGl2ZV92YWx1ZTpjc19saXZlX3ZhbHVl',
        },
      },
      woocommerce: {
        consumer_key: 'ck_live_value',
        consumer_secret: 'cs_live_value',
        basic_auth: 'Basic Y2tfbGl2ZV92YWx1ZTpjc19saXZlX3ZhbHVl',
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
            firstName: null,
            lastName: null,
            membership: null,
            woocommerceCredentials: {
              consumerKey: 'ck_live_value',
              consumerSecret: 'cs_live_value',
              basicAuthorizationHeader:
                'Basic Y2tfbGl2ZV92YWx1ZTpjc19saXZlX3ZhbHVl',
            },
          }),
        ],
      ]),
    );

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      AUTH_STORAGE_KEYS.wordpressCookies,
      expect.stringContaining('wordpress_logged_in_hash=logged-in'),
    );

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      AUTH_STORAGE_KEYS.woocommerceAuthHeader,
      'Basic Y2tfbGl2ZV92YWx1ZTpjc19saXZlX3ZhbHVl',
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

  it('applies the WooCommerce Basic authorization header to subsequent requests after login', async () => {
    const setCookieHeader =
      'wordpress_logged_in_hash=logged-in; path=/; secure; httponly';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          200,
          {
            success: true,
            mode: 'cookie',
            api_token: 'api-token-value',
            token: 'token-value',
            user: {
              id: 42,
              email: 'member@example.com',
              display: 'Member Example',
              woocommerce: {
                consumer_key: 'ck_live_value',
                consumer_secret: 'cs_live_value',
                basic_auth: 'Basic Y2tfbGl2ZV92YWx1ZTpjc19saXZlX3ZhbHVl',
              },
            },
            woocommerce: {
              consumer_key: 'ck_live_value',
              consumer_secret: 'cs_live_value',
              basic_auth: 'Basic Y2tfbGl2ZV92YWx1ZTpjc19saXZlX3ZhbHVl',
            },
          },
          {
            'set-cookie': setCookieHeader,
          },
        ),
      )
      .mockResolvedValueOnce(createJsonResponse(200, { success: true }));

    global.fetch = fetchMock as unknown as typeof fetch;

    await loginWithPassword({ username: 'member', password: 'passw0rd' });

    await registerAccount({
      username: 'newmember',
      email: 'newmember@example.com',
      password: 'aSecurePassword123',
    });

    const registerRequestInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(registerRequestInit?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Basic Y2tfbGl2ZV92YWx1ZTpjc19saXZlX3ZhbHVl',
      }),
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

    await updatePassword({
      token: 'token-value',
      currentPassword: 'OldPass123!',
      newPassword: 'NewPass456!',
      tokenLoginUrl: null,
      restNonce: null,
      userId: 7,
      identifier: 'member@example.com',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${WORDPRESS_CONFIG.baseUrl}/wp-json/gn/v1/change-password`,
      expect.objectContaining({ method: 'POST' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${WORDPRESS_CONFIG.baseUrl}/wp-json/gn/v1/sql/change-password`,
      expect.objectContaining({ method: 'POST' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${WORDPRESS_CONFIG.baseUrl}/wp-json/wp/v2/users/me`,
      expect.objectContaining({ method: 'GET' }),
    );

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      AUTH_STORAGE_KEYS.userProfile,
      expect.stringContaining('Member Example'),
    );
  });
});
