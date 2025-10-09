import deviceLog from '../utils/deviceLog';
import { WORDPRESS_CONFIG } from '../config/authConfig';
import {
  buildWordPressRequestInit,
  syncWordPressCookiesFromResponse,
} from './wordpressCookieService';
import {
  DiscountCalculationRequest,
  DiscountCalculationResult,
  DiscountDescriptor,
  MemberLookupResult,
  RecordTransactionRequest,
  TransactionRecord,
} from '../types/transactions';
import { calculateDiscountForAmount } from '../utils/discount';
import { validateMemberQrCode } from './wordpressAuthService';

const TRANSACTION_ENDPOINTS = {
  lookupMember: '/wp-json/gn/v1/discounts/lookup',
  recordTransaction: '/wp-json/gn/v1/discounts/transactions',
  history: '/wp-json/gn/v1/discounts/history',
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

const normalizePercentage = (value: number | null): number | null => {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0) {
    return 0;
  }

  const normalized = value > 1 ? value : value * 100;
  return Number(normalized.toFixed(2));
};

const parseUsage = (input: unknown) => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const payload = input as Record<string, unknown>;
  const usesToday =
    getNumber(payload.usesToday) ?? getNumber(payload.uses_today) ?? null;
  const usesTotal =
    getNumber(payload.usesTotal) ?? getNumber(payload.uses_total) ?? null;

  if (usesToday == null && usesTotal == null) {
    return null;
  }

  return {
    usesToday: usesToday != null ? Number(usesToday.toFixed(0)) : null,
    usesTotal: usesTotal != null ? Number(usesTotal.toFixed(0)) : null,
  };
};

const parseDiscountDescriptor = (
  input: unknown,
): DiscountDescriptor | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const payload = input as Record<string, unknown>;
  const rawType = getString(payload.type)?.toLowerCase();
  const value =
    getNumber(payload.value) ??
    getNumber(payload.amount) ??
    getNumber(payload.percentage) ??
    null;

  if (value == null) {
    return null;
  }

  const type: DiscountDescriptor['type'] =
    rawType === 'amount' ? 'amount' : 'percentage';

  return {
    token: getString(payload.token) ?? getString(payload.code) ?? null,
    label: getString(payload.label) ?? getString(payload.name) ?? null,
    type,
    value,
    currency:
      getString(payload.currency) ?? getString(payload.currency_code) ?? null,
    maxUses: getNumber(payload.max_uses) ?? getNumber(payload.maxUses) ?? null,
    expiresAt:
      getString(payload.expires_at) ??
      getString(payload.expiresAt) ??
      getString(payload.expiry) ??
      null,
  };
};

const parseMemberLookup = (
  payload: Record<string, unknown>,
): MemberLookupResult => {
  const member = (payload.member as Record<string, unknown>) ?? {};
  const membership =
    (member.membership as MemberLookupResult['membership']) ??
    (payload.membership as MemberLookupResult['membership']) ??
    null;
  const descriptor =
    parseDiscountDescriptor(payload.discount) ??
    parseDiscountDescriptor(member.discount);
  const allowedDiscount =
    descriptor && descriptor.type === 'percentage'
      ? normalizePercentage(descriptor.value)
      : getNumber(payload.allowedDiscount) ??
        getNumber(payload.allowed_discount) ??
        null;

  const membershipTier =
    getString(payload.membershipTier) ??
    getString(payload.membership_tier) ??
    getString(member.membership_tier) ??
    getString(member.plan_tier) ??
    (membership?.tier ?? null);

  return {
    token:
      getString(payload.token) ??
      getString(payload.member_token) ??
      getString(payload.qr_token) ??
      descriptor?.token ??
      '',
    valid:
      coerceBoolean(payload.valid) ??
      coerceBoolean(payload.eligible) ??
      true,
    memberId: getNumber(payload.member_id) ?? getNumber(member.id) ?? null,
    memberName:
      getString(payload.memberName) ??
      getString(payload.member_name) ??
      getString(member.name) ??
      getString(member.display) ??
      null,
    membershipTier,
    membership,
    allowedDiscount:
      allowedDiscount != null ? Number(allowedDiscount.toFixed(2)) : null,
    discountDescriptor: descriptor,
    eligible: coerceBoolean(payload.eligible),
    usage:
      parseUsage(payload.usage) ??
      parseUsage((member.usage as Record<string, unknown>) ?? null),
    message: getString(payload.message) ?? getString(payload.notice) ?? null,
  };
};

const parseDiscountResult = (
  payload: Record<string, unknown>,
): DiscountCalculationResult => {
  const descriptor =
    parseDiscountDescriptor(payload.discount) ??
    parseDiscountDescriptor(payload.discount_descriptor);
  const grossAmount =
    getNumber(payload.grossAmount) ?? getNumber(payload.gross_amount) ?? null;

  let discountPercentage =
    getNumber(payload.discountPercentage) ??
    getNumber(payload.discount_percentage) ??
    normalizePercentage(descriptor?.type === 'percentage' ? descriptor.value : null) ??
    0;

  let discountAmount =
    getNumber(payload.discountAmount) ??
    getNumber(payload.discount_amount) ??
    null;

  if (discountAmount == null && descriptor) {
    if (descriptor.type === 'amount') {
      discountAmount = Number(descriptor.value.toFixed(2));
      discountPercentage = grossAmount
        ? Number(((discountAmount / grossAmount) * 100).toFixed(2))
        : 0;
    } else {
      const percent = normalizePercentage(descriptor.value) ?? 0;
      discountPercentage = percent;
      discountAmount = Number(
        (((grossAmount ?? 0) * discountPercentage) / 100).toFixed(2),
      );
    }
  }

  discountAmount = Number((discountAmount ?? 0).toFixed(2));
  const netAmount = Number(
    (
      (grossAmount ?? 0) -
      (discountAmount ?? 0)
    ).toFixed(2),
  );

  return {
    discountPercentage,
    discountAmount,
    netAmount,
    grossAmount: grossAmount !== null ? Number(grossAmount.toFixed(2)) : null,
    currency:
      getString(payload.currency) ??
      getString(payload.currency_code) ??
      descriptor?.currency ??
      null,
    membershipTier:
      getString(payload.membershipTier) ??
      getString(payload.membership_tier) ??
      null,
    vendorTier:
      getString(payload.vendorTier) ?? getString(payload.vendor_tier) ?? null,
    message: getString(payload.message) ?? null,
    discountDescriptor: descriptor ?? undefined,
  };
};

const parseTransactionRecord = (
  payload: Record<string, unknown>,
  fallback: TransactionRecord,
): TransactionRecord => {
  const nested =
    (payload.transaction as Record<string, unknown> | undefined) ?? payload;
  const parsedDiscount = parseDiscountResult(nested);
  const id =
    getString(nested.id) ??
    getString(nested.transaction_id) ??
    fallback.id;

  return {
    ...fallback,
    ...parsedDiscount,
    id,
    grossAmount:
      parsedDiscount.grossAmount ?? fallback.grossAmount ?? null,
    memberToken:
      getString(nested.memberToken) ??
      getString(nested.member_token) ??
      fallback.memberToken,
    memberId:
      getNumber(nested.member_id) ??
      getNumber(nested.memberId) ??
      fallback.memberId ?? null,
    memberName:
      getString(nested.memberName) ??
      getString(nested.member_name) ??
      fallback.memberName,
    vendorName:
      getString(nested.vendorName) ??
      getString(nested.vendor_name) ??
      fallback.vendorName,
    vendorId:
      getNumber(nested.vendor_id) ??
      getNumber(nested.vendorId) ??
      fallback.vendorId ?? null,
    status:
      (getString(nested.status) as TransactionRecord['status']) ??
      fallback.status,
    createdAt:
      getString(nested.createdAt) ??
      getString(nested.created_at) ??
      fallback.createdAt,
    errorMessage:
      getString(nested.errorMessage) ??
      getString(nested.error_message) ??
      fallback.errorMessage,
  };
};

const parseTransactionList = (
  payload: unknown,
  fallbackStatus: TransactionRecord['status'] = 'completed',
): TransactionRecord[] => {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
    ? Array.isArray((payload as Record<string, unknown>).transactions)
      ? ((payload as Record<string, unknown>).transactions as unknown[])
      : Array.isArray((payload as Record<string, unknown>).data)
      ? ((payload as Record<string, unknown>).data as unknown[])
      : []
    : [];

  return source
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const base: TransactionRecord = {
        id: `remote-${index}`,
        memberToken: '',
        status: fallbackStatus,
        createdAt: new Date(0).toISOString(),
        discountPercentage: 0,
        discountAmount: 0,
        netAmount: 0,
        grossAmount: 0,
        currency: null,
        membershipTier: null,
        vendorTier: null,
        message: null,
        vendorName: null,
        memberName: null,
        membership: null,
        errorMessage: null,
      };

      try {
        return parseTransactionRecord(item as Record<string, unknown>, base);
      } catch (error) {
        deviceLog.warn('transaction.parseTransactionList.error', {
          message:
            error instanceof Error ? error.message : 'Unable to parse record',
        });
        return null;
      }
    })
    .filter((record): record is TransactionRecord => Boolean(record));
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
  vendorId?: number | null,
): Promise<MemberLookupResult> => {
  try {
    const body: Record<string, unknown> = {
      qr_token: token,
    };

    if (typeof vendorId === 'number' && Number.isFinite(vendorId)) {
      body.vendor_id = vendorId;
    }

    const payload = await performRequest<Record<string, unknown>>(
      TRANSACTION_ENDPOINTS.lookupMember,
      {
        method: 'POST',
        headers: buildHeaders(authToken ?? undefined),
        body: JSON.stringify(body),
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

  let descriptor = params.discountDescriptor ?? null;
  let membershipTier = params.membershipTier ?? null;
  let vendorTier = params.vendorTier ?? null;
  let message: string | null = null;

  if (!descriptor && params.memberToken) {
    try {
      const body: Record<string, unknown> = {
        qr_token: params.memberToken,
        gross_amount: sanitizedGross,
        currency: params.currency,
      };
      if (params.vendorId != null) {
        body.vendor_id = params.vendorId;
      }
      if (params.memberId != null) {
        body.member_id = params.memberId;
      }

      const payload = await performRequest<Record<string, unknown>>(
        TRANSACTION_ENDPOINTS.lookupMember,
        {
          method: 'POST',
          headers: buildHeaders(authToken ?? undefined),
          body: JSON.stringify(body),
        },
      );

      const lookup = parseMemberLookup(payload);
      descriptor = lookup.discountDescriptor ?? descriptor;
      membershipTier = lookup.membershipTier ?? membershipTier;
      message = lookup.message ?? null;
      deviceLog.debug('transaction.calculateDiscount.lookup', lookup);
    } catch (error) {
      const lookupMessage =
        error instanceof Error ? error.message : undefined;
      if (lookupMessage) {
        message = lookupMessage;
      }
      deviceLog.warn('transaction.calculateDiscount.lookupError', {
        message: lookupMessage ?? 'Unable to refresh discount descriptor.',
      });
    }
  }

  if (descriptor) {
    const descriptorResult = parseDiscountResult({
      discount: descriptor,
      gross_amount: sanitizedGross,
      currency: params.currency,
      membership_tier: membershipTier ?? undefined,
      vendor_tier: vendorTier ?? undefined,
    });

    return {
      ...descriptorResult,
      currency: descriptorResult.currency ?? params.currency ?? null,
      membershipTier: membershipTier ?? descriptorResult.membershipTier ?? null,
      vendorTier: vendorTier ?? descriptorResult.vendorTier ?? null,
      message,
    };
  }

  return {
    ...optimistic,
    currency: params.currency ?? null,
    membershipTier,
    vendorTier,
    message,
  };
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
    memberId: request.memberId ?? null,
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
    vendorId: request.vendorId ?? null,
    errorMessage: null,
    discountDescriptor: request.discountDescriptor ?? undefined,
  };

  try {
    const payload = await performRequest<Record<string, unknown>>(
      TRANSACTION_ENDPOINTS.recordTransaction,
      {
        method: 'POST',
        headers: buildHeaders(authToken ?? undefined),
        body: JSON.stringify({
          qr_token: request.memberToken,
          member_id: request.memberId ?? undefined,
          vendor_id: request.vendorId ?? undefined,
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

export const fetchMemberTransactions = async (
  authToken?: string | null,
): Promise<TransactionRecord[]> => {
  try {
    const payload = await performRequest<unknown>(
      `${TRANSACTION_ENDPOINTS.history}?scope=member`,
      {
        method: 'GET',
        headers: buildHeaders(authToken ?? undefined),
      },
    );

    const records = parseTransactionList(payload);
    deviceLog.debug('transaction.fetchMemberTransactions.success', {
      count: records.length,
    });
    return records;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to fetch member transactions.';
    deviceLog.warn('transaction.fetchMemberTransactions.error', { message });
    return [];
  }
};

export const fetchVendorTransactions = async (
  authToken?: string | null,
): Promise<TransactionRecord[]> => {
  try {
    const payload = await performRequest<unknown>(
      `${TRANSACTION_ENDPOINTS.history}?scope=vendor`,
      {
        method: 'GET',
        headers: buildHeaders(authToken ?? undefined),
      },
    );

    const records = parseTransactionList(payload);
    deviceLog.debug('transaction.fetchVendorTransactions.success', {
      count: records.length,
    });
    return records;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to fetch vendor transactions.';
    deviceLog.warn('transaction.fetchVendorTransactions.error', { message });
    return [];
  }
};
