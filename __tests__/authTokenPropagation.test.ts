jest.mock(
  '@env',
  () => ({
    WORDPRESS_BASE_URL: 'https://example.com',
    WOOCOMMERCE_CONSUMER_KEY: '',
    WOOCOMMERCE_CONSUMER_SECRET: '',
  }),
  { virtual: true },
);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../src/utils/deviceLog', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock('../src/services/wordpressCookieService', () => ({
  __esModule: true,
  buildWordPressRequestInit: jest.fn(
    async (init?: RequestInit): Promise<RequestInit> => ({
      ...(init ?? {}),
      credentials: init?.credentials ?? 'omit',
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
      },
    }),
  ),
  syncWordPressCookiesFromResponse: jest.fn(),
}));

jest.mock('../src/services/wordpressAuthService', () => ({
  __esModule: true,
  ensureValidSessionToken: jest.fn<
    Promise<string | null>,
    [string | null | undefined]
  >(),
  validateMemberQrCode: jest.fn(),
}));

import { MEMBERSHIP_CONFIG } from '../src/config/membershipConfig';
import { WORDPRESS_CONFIG } from '../src/config/authConfig';
import {
  fetchMembershipPlans,
  createMembershipPaymentSession,
  confirmMembershipUpgrade,
} from '../src/services/membershipService';
import { fetchVendorTiers } from '../src/services/vendorService';
import {
  lookupMember,
  calculateDiscount,
  recordTransaction,
  fetchMemberTransactions,
  fetchVendorTransactions,
} from '../src/services/transactionService';
import { RecordTransactionRequest } from '../src/types/transactions';
import {
  buildWordPressRequestInit,
  syncWordPressCookiesFromResponse,
} from '../src/services/wordpressCookieService';
import {
  ensureValidSessionToken,
  validateMemberQrCode,
} from '../src/services/wordpressAuthService';

const mockBuildWordPressRequestInit =
  buildWordPressRequestInit as jest.MockedFunction<
    typeof buildWordPressRequestInit
  >;
const mockSyncWordPressCookiesFromResponse =
  syncWordPressCookiesFromResponse as jest.MockedFunction<
    typeof syncWordPressCookiesFromResponse
  >;
const mockEnsureValidSessionToken =
  ensureValidSessionToken as jest.MockedFunction<
    typeof ensureValidSessionToken
  >;
const mockValidateMemberQrCode =
  validateMemberQrCode as jest.MockedFunction<
    typeof validateMemberQrCode
  >;

const createJsonResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json' },
): Response => {
  const headerMap = Object.entries(headers).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      acc[key.toLowerCase()] = value;
      return acc;
    },
    {},
  );

  return {
    status,
    ok: status >= 200 && status < 300,
    url: 'https://example.com/mock',
    json: jest.fn(async () => body),
    text: jest.fn(async () => JSON.stringify(body)),
    headers: {
      get: (name: string) => headerMap[name.toLowerCase()] ?? null,
    } as unknown as Headers,
    clone: () => createJsonResponse(status, body, headers),
  } as unknown as Response;
};

const expectAuthorizedFetch = (
  callIndex: number,
  url: string,
  method: string,
) => {
  const call = (global.fetch as jest.Mock).mock.calls[callIndex - 1];
  expect(call?.[0]).toBe(url);
  const init = call?.[1] as RequestInit;
  expect(init).toEqual(
    expect.objectContaining({
      method,
      headers: expect.objectContaining({
        Authorization: 'Bearer persisted-token',
      }),
    }),
  );
};

describe('authenticated service requests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureValidSessionToken.mockResolvedValue('persisted-token');
    mockValidateMemberQrCode.mockResolvedValue({ valid: true });
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('reuses the persisted session token across membership, vendor, and transaction API calls', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(createJsonResponse(200, { plans: [] }))
      .mockResolvedValueOnce(createJsonResponse(200, { requiresPayment: false }))
      .mockResolvedValueOnce(createJsonResponse(200, { success: true }))
      .mockResolvedValueOnce(createJsonResponse(200, { tiers: [] }))
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          member: { id: 101, name: 'Member Example' },
          membership_tier: 'gold',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          discount: { type: 'percentage', value: 5 },
          membership_tier: 'gold',
          member: { id: 101, name: 'Member Example' },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          transaction: {
            id: 'txn_123',
            member_token: 'qr-token',
            status: 'completed',
            created_at: '2024-01-01T00:00:00Z',
            gross_amount: 100,
            discount_percentage: 5,
            discount_amount: 5,
            net_amount: 95,
            currency: 'THB',
          },
        }),
      )
      .mockResolvedValueOnce(createJsonResponse(200, { transactions: [] }))
      .mockResolvedValueOnce(createJsonResponse(200, { transactions: [] }));

    await fetchMembershipPlans();
    expectAuthorizedFetch(
      1,
      `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.plans}`,
      'GET',
    );

    await createMembershipPaymentSession('gold-membership');
    expectAuthorizedFetch(
      2,
      `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.createPaymentSession}`,
      'POST',
    );

    await confirmMembershipUpgrade('gold-membership', undefined, 'pi_123');
    expectAuthorizedFetch(
      3,
      `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.confirm}`,
      'POST',
    );

    await fetchVendorTiers();
    expectAuthorizedFetch(
      4,
      `${WORDPRESS_CONFIG.baseUrl}/wp-json/gn/v1/vendors/tiers`,
      'GET',
    );

    await lookupMember('qr-token');
    expectAuthorizedFetch(
      5,
      `${WORDPRESS_CONFIG.baseUrl}/wp-json/gn/v1/discounts/lookup`,
      'POST',
    );

    await calculateDiscount({
      grossAmount: 100,
      currency: 'THB',
      memberToken: 'qr-token',
    });
    expectAuthorizedFetch(
      6,
      `${WORDPRESS_CONFIG.baseUrl}/wp-json/gn/v1/discounts/lookup`,
      'POST',
    );

    const transactionRequest: RecordTransactionRequest = {
      memberToken: 'qr-token',
      grossAmount: 100,
      currency: 'THB',
    };
    await recordTransaction(transactionRequest);
    expectAuthorizedFetch(
      7,
      `${WORDPRESS_CONFIG.baseUrl}/wp-json/gn/v1/discounts/transactions`,
      'POST',
    );

    await fetchMemberTransactions();
    expectAuthorizedFetch(
      8,
      `${WORDPRESS_CONFIG.baseUrl}/wp-json/gn/v1/discounts/history?scope=member`,
      'GET',
    );

    await fetchVendorTransactions();
    expectAuthorizedFetch(
      9,
      `${WORDPRESS_CONFIG.baseUrl}/wp-json/gn/v1/discounts/history?scope=vendor`,
      'GET',
    );

    expect(mockEnsureValidSessionToken).toHaveBeenCalledTimes(9);
    expect(mockEnsureValidSessionToken.mock.calls.every(([arg]) => arg == null)).toBe(true);
    expect(mockValidateMemberQrCode).not.toHaveBeenCalled();
    expect(mockBuildWordPressRequestInit).toHaveBeenCalledTimes(9);
  });

  it('fails fast when the persisted session token is unavailable', async () => {
    mockEnsureValidSessionToken.mockResolvedValueOnce(null);

    await expect(fetchMembershipPlans()).rejects.toThrow(
      'Authentication token is unavailable.',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
