import deviceLog from '../utils/deviceLog';
import { WORDPRESS_CONFIG } from '../config/authConfig';
import {
  buildWordPressRequestInit,
  syncWordPressCookiesFromResponse,
} from './wordpressCookieService';
import {
  DiscountCalculationRequest,
  DiscountCalculationResult,
  MemberLookupResult,
  RecordTransactionRequest,
  TransactionRecord,
} from '../types/transactions';
import { calculateDiscountForAmount } from '../utils/discount';
import { validateMemberQrCode } from './wordpressAuthService';

const TRANSACTION_ENDPOINTS = {
  lookupMember: '/wp-json/gn/v1/transactions/lookup-member',
  calculateDiscount: '/wp-json/gn/v1/transactions/calculate-discount',
  recordTransaction: '/wp-json/gn/v1/transactions',
};

const buildHeaders = (token?: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (token) {
    const bearer = token.startsWith('Bearer ')
      ? token
      : `Bearer ${token.trim()}`;
    headers.Authorization = bearer;
    headers['X-Authorization'] = bearer;
  }

  return headers;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === 'string'
        ? payload
        : ((payload as Record<string, unknown>)?.message as string) ??
          'Unable to complete the request.';
    throw new Error(message);
  }

  return (payload as T) ?? ({} as T);
};

const getString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const getNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const coerceBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  return null;
};

const parseMemberLookup = (payload: Record<string, unknown>): MemberLookupResult => {
  const token =
    getString(payload.token) ??
    getString(payload.member_token) ??
    getString(payload.qr_token) ??
    '';

  const membership =
    (payload.membership as MemberLookupResult['membership']) ?? null;

  return {
    token,
    valid: coerceBoolean(payload.valid) ?? true,
    memberName:
      getString(payload.memberName) ??
      getString(payload.member_name) ??
      getString(payload.name) ??
      null,
    membershipTier:
      getString(payload.membershipTier) ??
      getString(payload.membership_tier) ??
      (membership?.tier ?? null),
    membership,
    allowedDiscount:
      getNumber(payload.allowedDiscount) ??
      getNumber(payload.allowed_discount) ??
      null,
    message: getString(payload.message),
  };
};

const parseDiscountResult = (
  payload: Record<string, unknown>,
): DiscountCalculationResult => {
  const discountPercentage =
    getNumber(payload.discountPercentage) ??
    getNumber(payload.discount_percentage) ??
    0;
  const grossAmount =
    getNumber(payload.grossAmount) ?? getNumber(payload.gross_amount) ?? null;
  const discountAmount =
    getNumber(payload.discountAmount) ??
    getNumber(payload.discount_amount) ??
    (((grossAmount ?? 0) * discountPercentage) / 100);
  const netAmount =
    getNumber(payload.netAmount) ??
    getNumber(payload.net_amount) ??
    Number((((grossAmount ?? 0) - discountAmount).toFixed(2)));

  return {
    discountPercentage,
    discountAmount: Number(discountAmount.toFixed(2)),
    netAmount: Number(netAmount.toFixed(2)),
    grossAmount: grossAmount !== null ? Number(grossAmount.toFixed(2)) : null,
    currency:
      getString(payload.currency) ?? getString(payload.currency_code) ?? null,
    membershipTier:
      getString(payload.membershipTier) ??
      getString(payload.membership_tier) ??
      null,
    vendorTier:
      getString(payload.vendorTier) ?? getString(payload.vendor_tier) ?? null,
    message: getString(payload.message) ?? null,
  };
};

const parseTransactionRecord = (
  payload: Record<string, unknown>,
  fallback: TransactionRecord,
): TransactionRecord => {
  const parsedDiscount = parseDiscountResult(payload);
  const id =
    getString(payload.id) ??
    getString(payload.transaction_id) ??
    fallback.id;

  return {
    ...fallback,
    ...parsedDiscount,
    id,
    grossAmount:
      parsedDiscount.grossAmount ?? fallback.grossAmount ?? null,
    memberToken:
      getString(payload.memberToken) ??
      getString(payload.member_token) ??
      fallback.memberToken,
    memberName:
      getString(payload.memberName) ??
      getString(payload.member_name) ??
      fallback.memberName,
    vendorName:
      getString(payload.vendorName) ??
      getString(payload.vendor_name) ??
      fallback.vendorName,
    status:
      (getString(payload.status) as TransactionRecord['status']) ??
      fallback.status,
    createdAt:
      getString(payload.createdAt) ??
      getString(payload.created_at) ??
      fallback.createdAt,
    errorMessage:
      getString(payload.errorMessage) ??
      getString(payload.error_message) ??
      fallback.errorMessage,
  };
};

const performRequest = async <T>(
  endpoint: string,
  init: RequestInit,
): Promise<T> => {
  const requestInit = await buildWordPressRequestInit(init);
  const response = await fetch(`${WORDPRESS_CONFIG.baseUrl}${endpoint}`, requestInit);
  await syncWordPressCookiesFromResponse(response);
  return parseJson<T>(response);
};

export const lookupMember = async (
  token: string,
  authToken?: string | null,
): Promise<MemberLookupResult> => {
  try {
    const payload = await performRequest<Record<string, unknown>>(
      TRANSACTION_ENDPOINTS.lookupMember,
      {
        method: 'POST',
        headers: buildHeaders(authToken ?? undefined),
        body: JSON.stringify({ token }),
      },
    );

    const result = parseMemberLookup(payload);
    deviceLog.debug('transaction.lookupMember.success', result);
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to lookup member.';
    deviceLog.warn('transaction.lookupMember.error', { message });

    try {
      const fallback = await validateMemberQrCode(token, authToken);
      deviceLog.debug('transaction.lookupMember.fallback', fallback);
      return fallback as MemberLookupResult;
    } catch (fallbackError) {
      deviceLog.warn('transaction.lookupMember.fallbackError', {
        message:
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError),
      });
      throw error instanceof Error ? error : new Error(message);
    }
  }
};

export const calculateDiscount = async (
  params: DiscountCalculationRequest,
  authToken?: string | null,
): Promise<DiscountCalculationResult> => {
  const sanitizedGross = Number.isFinite(params.grossAmount)
    ? params.grossAmount
    : 0;

  const optimistic = calculateDiscountForAmount(
    sanitizedGross,
    params.membershipTier ?? null,
    params.vendorTier ?? null,
  );

  try {
    const payload = await performRequest<Record<string, unknown>>(
      TRANSACTION_ENDPOINTS.calculateDiscount,
      {
        method: 'POST',
        headers: buildHeaders(authToken ?? undefined),
        body: JSON.stringify({
          membership_tier: params.membershipTier,
          vendor_tier: params.vendorTier,
          gross_amount: sanitizedGross,
          currency: params.currency,
        }),
      },
    );

    const result = parseDiscountResult(payload);
    deviceLog.debug('transaction.calculateDiscount.success', result);
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to calculate discount.';
    deviceLog.warn('transaction.calculateDiscount.error', { message });
    return {
      ...optimistic,
      currency: params.currency ?? null,
      membershipTier: params.membershipTier ?? null,
      vendorTier: params.vendorTier ?? null,
      message,
    };
  }
};

export const recordTransaction = async (
  request: RecordTransactionRequest,
  authToken?: string | null,
): Promise<TransactionRecord> => {
  const optimisticDiscount = calculateDiscountForAmount(
    request.grossAmount,
    request.membershipTier ?? null,
    request.vendorTier ?? null,
  );

  const optimisticRecord: TransactionRecord = {
    id: `temp-${Date.now()}`,
    memberToken: request.memberToken,
    memberName: request.memberName ?? null,
    membership: request.membership ?? null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    discountPercentage: optimisticDiscount.discountPercentage,
    discountAmount: optimisticDiscount.discountAmount,
    netAmount: optimisticDiscount.netAmount,
    grossAmount: Number(request.grossAmount.toFixed(2)),
    currency: request.currency ?? null,
    membershipTier: request.membershipTier ?? null,
    vendorTier: request.vendorTier ?? null,
    message: null,
    vendorName: null,
    errorMessage: null,
  };

  try {
    const payload = await performRequest<Record<string, unknown>>(
      TRANSACTION_ENDPOINTS.recordTransaction,
      {
        method: 'POST',
        headers: buildHeaders(authToken ?? undefined),
        body: JSON.stringify({
          token: request.memberToken,
          membership_tier: request.membershipTier,
          vendor_tier: request.vendorTier,
          gross_amount: request.grossAmount,
          discount_percentage: request.discountPercentage ?? undefined,
          discount_amount: request.discountAmount ?? undefined,
          net_amount: request.netAmount ?? undefined,
          member_name: request.memberName ?? undefined,
          metadata: request.metadata,
          notes: request.notes ?? undefined,
          currency: request.currency,
        }),
      },
    );

    const result = parseTransactionRecord(payload, {
      ...optimisticRecord,
      status: 'completed',
    });
    deviceLog.debug('transaction.recordTransaction.success', result);
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to record transaction.';
    deviceLog.warn('transaction.recordTransaction.error', { message });
    return {
      ...optimisticRecord,
      status: 'failed',
      errorMessage: message,
    };
  }
};
