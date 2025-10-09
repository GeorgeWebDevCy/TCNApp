import { MEMBERSHIP_CONFIG } from '../config/membershipConfig';
// Note: We initialise Stripe PaymentSheet with a PaymentIntent client secret.
// Customer and ephemeral key are optional when not using a saved-payment flow.
import { MembershipPlan } from '../types/auth';
import deviceLog from '../utils/deviceLog';
import {
  buildWordPressRequestInit,
  syncWordPressCookiesFromResponse,
} from './wordpressCookieService';

export const DEFAULT_MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: 'blue-membership',
    name: 'Blue Membership',
    price: 0,
    currency: 'THB',
    interval: 'year',
    description: 'Free access when you download the app.',
    features: [
      'Discover participating vendors and network news.',
      'Receive general promotions inside the app.',
    ],
  },
  {
    id: 'gold-membership',
    name: 'Gold Membership',
    price: 50000,
    currency: 'THB',
    interval: 'year',
    description: 'Entry-level membership with annual perks.',
    features: [
      'Unlock standard member discounts across the network.',
      'Eligible for Membership Network Program progression.',
    ],
    highlight: true,
  },
  {
    id: 'platinum-membership',
    name: 'Platinum Membership',
    price: 120000,
    currency: 'THB',
    interval: 'year',
    description: 'Enhanced benefits for engaged members.',
    features: [
      'Higher-tier discounts with premium vendors.',
      'Priority invitations to member events and drops.',
    ],
  },
  {
    id: 'black-membership',
    name: 'Black Membership',
    price: 200000,
    currency: 'THB',
    interval: 'year',
    description: 'Top-tier access for the most dedicated members.',
    features: [
      'Maximum partner discounts and VIP perks.',
      'Exclusive campaigns and concierge support.',
    ],
  },
];

type WordPressMembershipPlan = MembershipPlan & {
  amount_minor?: number;
  amountMinor?: number;
  fee?: number;
  formatted_fee?: string;
  [key: string]: unknown;
};

type MembershipPlansResponse = {
  plans?: WordPressMembershipPlan[];
} & Record<string, unknown>;

type PaymentSessionResponse =
  | {
      requiresPayment: true;
      paymentIntentClientSecret: string;
      // Optional extras when using a Customer session
      customerId?: string | null;
      customerEphemeralKeySecret?: string | null;
      // Helpful metadata
      paymentIntentId?: string | null;
      publishableKey?: string | null;
    }
  | {
      requiresPayment: false;
      paymentIntentId?: string | null;
      publishableKey?: string | null;
    };

type ConfirmUpgradeResponse = {
  success: boolean;
  message?: string;
};

const buildHeaders = (token?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (token) {
    const bearer = `Bearer ${token}`;
    headers.Authorization = bearer;
    headers['X-Authorization'] = bearer;
  }

  return headers;
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === 'string'
        ? payload
        : (payload?.message as string) ?? 'Unable to complete the request.';
    throw new Error(message);
  }

  return (payload as T) ?? ({} as T);
};

const normalizePlanPrice = (plan: WordPressMembershipPlan): MembershipPlan => {
  const amountMinor =
    typeof plan.amount_minor === 'number'
      ? plan.amount_minor
      : typeof plan.amountMinor === 'number'
        ? plan.amountMinor
        : undefined;

  const rawPrice = typeof plan.price === 'number' ? plan.price : 0;

  const normalizedPrice =
    typeof amountMinor === 'number'
      ? amountMinor
      : rawPrice > 0 && rawPrice < 1000
        ? Math.round(rawPrice * 100)
        : rawPrice;

  return {
    ...plan,
    price: normalizedPrice,
  };
};

const normalizePlans = (
  plans: WordPressMembershipPlan[],
): MembershipPlan[] => plans.map(normalizePlanPrice);

const headersToRecord = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) {
    return {};
  }

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const entries: Record<string, string> = {};
    headers.forEach((value, key) => {
      entries[key] = value;
    });
    return entries;
  }

  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  return { ...(headers as Record<string, string>) };
};

const sanitizeHeadersForLog = (headers?: HeadersInit): Record<string, string> => {
  const normalized = headersToRecord(headers);
  return Object.entries(normalized).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (key.toLowerCase().includes('authorization')) {
        acc[key] = '[REDACTED]';
      } else {
        acc[key] = value;
      }
      return acc;
    },
    {},
  );
};

const summarizeSecretForLog = (
  label: string,
  value: string | null | undefined,
): Record<string, unknown> => {
  if (typeof value === 'string' && value.length > 0) {
    return {
      [`${label}Present`]: true,
      [`${label}Length`]: value.length,
      [`${label}Suffix`]: value.length > 6 ? value.slice(-6) : value,
    };
  }

  return {
    [`${label}Present`]: false,
    [`${label}Length`]: null,
    [`${label}Suffix`]: null,
  };
};

const buildErrorLogPayload = (
  error: unknown,
  context: Record<string, unknown> = {},
): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      ...context,
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    ...context,
    message: typeof error === 'string' ? error : String(error),
  };
};

export const fetchMembershipPlans = async (
  token?: string,
): Promise<MembershipPlan[]> => {
  const requestUrl = `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.plans}`;
  deviceLog.info('membership.plans.fetch.start', {
    url: requestUrl,
    hasToken: Boolean(token),
  });

  try {
    const requestInit = await buildWordPressRequestInit({
      method: 'GET',
      headers: buildHeaders(token),
    });

    deviceLog.debug('membership.plans.fetch.request', {
      url: requestUrl,
      method: requestInit.method ?? 'GET',
      headers: sanitizeHeadersForLog(requestInit.headers),
    });

    const response = await fetch(requestUrl, requestInit);

    deviceLog.debug('membership.plans.fetch.responseMeta', {
      url: response.url,
      status: response.status,
      ok: response.ok,
    });

    await syncWordPressCookiesFromResponse(response);

    const payload = await handleResponse<
      MembershipPlansResponse | MembershipPlan[]
    >(response);

    const plans = Array.isArray(payload)
      ? normalizePlans(payload as WordPressMembershipPlan[])
      : Array.isArray(payload.plans)
        ? normalizePlans(payload.plans as WordPressMembershipPlan[])
        : [];

    deviceLog.success('membership.plans.fetch.success', {
      planCount: plans.length,
      highlightedPlan: plans.find(plan => plan.highlight)?.id ?? null,
    });

    deviceLog.debug('membership.plans.fetch.details', {
      planIds: plans.map(plan => plan.id),
      currencies: Array.from(new Set(plans.map(plan => plan.currency))),
    });

    return plans;
  } catch (error) {
    deviceLog.error('membership.plans.fetch.error', buildErrorLogPayload(error));
    throw error;
  }
};

type PaymentSessionApiResponse = {
  requiresPayment?: boolean;
  requires_payment?: boolean;
  paymentIntentId?: string | null;
  payment_intent?: string | null;
  id?: string | null; // Stripe PI id when returning raw PaymentIntent
  paymentIntentClientSecret?: string | null;
  payment_intent_client_secret?: string | null;
  client_secret?: string | null; // Stripe PI client secret when returning raw PaymentIntent
  customerId?: string | null;
  customer?: string | null;
  customerEphemeralKeySecret?: string | null;
  customer_ephemeral_key_secret?: string | null;
  publishableKey?: string | null;
  publishable_key?: string | null;
} & Record<string, unknown>;

export const createMembershipPaymentSession = async (
  plan: string,
  token?: string,
): Promise<PaymentSessionResponse> => {
  const requestUrl = `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.createPaymentSession}`;
  deviceLog.info('membership.paymentSession.create.start', {
    plan,
    url: requestUrl,
    hasToken: Boolean(token),
  });

  try {
    const requestInit = await buildWordPressRequestInit({
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ plan }),
    });

    deviceLog.debug('membership.paymentSession.create.request', {
      url: requestUrl,
      method: requestInit.method ?? 'POST',
      headers: sanitizeHeadersForLog(requestInit.headers),
      hasBody: Boolean(requestInit.body),
    });

    const response = await fetch(requestUrl, requestInit);

    deviceLog.debug('membership.paymentSession.create.responseMeta', {
      url: response.url,
      status: response.status,
      ok: response.ok,
    });

    await syncWordPressCookiesFromResponse(response);

    const payload = await handleResponse<PaymentSessionApiResponse>(response);

    const requiresPayment =
      typeof payload.requiresPayment === 'boolean'
        ? payload.requiresPayment
        : typeof payload.requires_payment === 'boolean'
          ? payload.requires_payment
          : true;

    const paymentIntentId = (() => {
      if (typeof payload.paymentIntentId === 'string') return payload.paymentIntentId;
      if (typeof payload.payment_intent === 'string') return payload.payment_intent;
      if (typeof payload.id === 'string' && payload.id.startsWith('pi_')) return payload.id;
      return null;
    })();

    const paymentIntentClientSecret = (() => {
      if (typeof payload.paymentIntentClientSecret === 'string') return payload.paymentIntentClientSecret;
      if (typeof payload.payment_intent_client_secret === 'string') return payload.payment_intent_client_secret;
      if (typeof payload.client_secret === 'string') return payload.client_secret;
      return null;
    })();
    const customerId =
      payload.customerId ??
      (typeof payload.customer === 'string' ? payload.customer : null);
    const customerEphemeralKeySecret =
      payload.customerEphemeralKeySecret ??
      (typeof payload.customer_ephemeral_key_secret === 'string'
        ? payload.customer_ephemeral_key_secret
        : null);
    const publishableKey =
      payload.publishableKey ??
      (typeof payload.publishable_key === 'string'
        ? payload.publishable_key
        : null);

    const normalizedPayload: PaymentSessionResponse = requiresPayment
      ? (() => {
          if (!paymentIntentClientSecret) {
            throw new Error('Missing payment intent client secret.');
          }

          // For basic card collection we can initialise PaymentSheet with only the
          // PaymentIntent client secret. Customer+ephemeral key are optional.
          return {
            requiresPayment: true,
            paymentIntentClientSecret,
            customerEphemeralKeySecret,
            customerId,
            paymentIntentId,
            publishableKey,
          };
        })()
      : {
          requiresPayment: false,
          paymentIntentId,
          publishableKey,
        };

    deviceLog.success('membership.paymentSession.create.success', {
      plan,
      requiresPayment: normalizedPayload.requiresPayment,
      hasPublishableKey: Boolean(normalizedPayload.publishableKey),
      hasPaymentIntentSecret: Boolean(
        'paymentIntentClientSecret' in normalizedPayload
          ? normalizedPayload.paymentIntentClientSecret
          : null,
      ),
      hasCustomerKey: Boolean(
        'customerEphemeralKeySecret' in normalizedPayload
          ? normalizedPayload.customerEphemeralKeySecret
          : null,
      ),
    });

    deviceLog.debug('membership.paymentSession.create.details', {
      plan,
      requiresPayment: normalizedPayload.requiresPayment,
      customerIdSuffix:
        'customerId' in normalizedPayload && normalizedPayload.customerId
          ? normalizedPayload.customerId.length > 6
            ? normalizedPayload.customerId.slice(-6)
            : normalizedPayload.customerId
          : null,
      paymentIntentIdSuffix:
        normalizedPayload.paymentIntentId &&
        normalizedPayload.paymentIntentId.length > 6
          ? normalizedPayload.paymentIntentId.slice(-6)
          : normalizedPayload.paymentIntentId ?? null,
      ...summarizeSecretForLog(
        'paymentIntentSecret',
        'paymentIntentClientSecret' in normalizedPayload
          ? normalizedPayload.paymentIntentClientSecret
          : null,
      ),
      ...summarizeSecretForLog(
        'customerEphemeralKeySecret',
        'customerEphemeralKeySecret' in normalizedPayload
          ? normalizedPayload.customerEphemeralKeySecret
          : null,
      ),
      ...summarizeSecretForLog(
        'publishableKey',
        normalizedPayload.publishableKey ?? null,
      ),
    });

    return normalizedPayload;
  } catch (error) {
    deviceLog.error(
      'membership.paymentSession.create.error',
      buildErrorLogPayload(error, { plan }),
    );
    throw error;
  }
};

export const confirmMembershipUpgrade = async (
  plan: string,
  token?: string,
  paymentIntentId?: string | null,
): Promise<ConfirmUpgradeResponse> => {
  const requestUrl = `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.confirm}`;
  deviceLog.info('membership.upgrade.confirm.start', {
    plan,
    url: requestUrl,
    hasToken: Boolean(token),
    hasPaymentIntentId: Boolean(paymentIntentId),
  });

  try {
    const requestBody = {
      plan,
      ...(paymentIntentId
        ? {
            payment_intent: paymentIntentId,
          }
        : {}),
    };

    const requestInit = await buildWordPressRequestInit({
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify(requestBody),
    });

    deviceLog.debug('membership.upgrade.confirm.request', {
      url: requestUrl,
      method: requestInit.method ?? 'POST',
      headers: sanitizeHeadersForLog(requestInit.headers),
      hasBody: Boolean(requestInit.body),
      bodyKeys: Object.keys(requestBody),
    });

    const response = await fetch(requestUrl, requestInit);

    deviceLog.debug('membership.upgrade.confirm.responseMeta', {
      url: response.url,
      status: response.status,
      ok: response.ok,
    });

    await syncWordPressCookiesFromResponse(response);

    const payload = await handleResponse<ConfirmUpgradeResponse>(response);

    deviceLog.success('membership.upgrade.confirm.success', {
      plan,
      acknowledged: payload.success,
      hasMessage: Boolean(payload.message),
    });

    deviceLog.debug('membership.upgrade.confirm.details', {
      plan,
      acknowledged: payload.success,
      message: payload.message ?? null,
    });

    return payload;
  } catch (error) {
    deviceLog.error(
      'membership.upgrade.confirm.error',
      buildErrorLogPayload(error, {
        plan,
        hasPaymentIntentId: Boolean(paymentIntentId),
      }),
    );
    throw error;
  }
};
