import { fetchMemberTransactions, recordTransaction } from '../src/services/transactionService';
import type { RecordTransactionRequest } from '../src/types/transactions';

jest.mock('../src/services/wordpressCookieService', () => ({
  buildWordPressRequestInit: jest.fn(async (init: RequestInit) => init),
  syncWordPressCookiesFromResponse: jest.fn(),
}));

jest.mock('../src/services/wordpressAuthService', () => ({
  ensureValidSessionToken: jest.fn(),
  validateMemberQrCode: jest.fn(),
}));

const { ensureValidSessionToken } = jest.requireMock('../src/services/wordpressAuthService');

describe('transactionService error handling', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    (ensureValidSessionToken as jest.Mock).mockResolvedValue('secure-token');
  });

  afterEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (global as unknown as Record<string, unknown>).fetch;
    }
  });

  it('throws an AppError with code E3104 when transaction history request fails', async () => {
    const failingResponse = {
      ok: false,
      status: 502,
      headers: { get: () => 'application/json' },
      json: async () => ({ message: 'Upstream unavailable' }),
    } as unknown as Response;

    global.fetch = jest.fn().mockResolvedValue(failingResponse);

    await expect(fetchMemberTransactions()).rejects.toMatchObject({
      code: 'E3104',
      id: 'TRANSACTION_HISTORY_FETCH_FAILED',
    });
  });

  it('returns a failed optimistic record with an E3101 error message when recording a transaction fails', async () => {
    const failingResponse = {
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      json: async () => ({ message: 'Unable to persist transaction' }),
    } as unknown as Response;

    global.fetch = jest.fn().mockResolvedValue(failingResponse);

    const request: RecordTransactionRequest = {
      memberToken: 'member-token',
      grossAmount: 100,
      currency: 'THB',
    };

    const result = await recordTransaction(request);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/^E3101:/);
    expect(global.fetch).toHaveBeenCalled();
  });
});
