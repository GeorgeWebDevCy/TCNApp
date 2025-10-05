import { MEMBERSHIP_CONFIG } from '../config/membershipConfig';
import { StripePaymentSession } from '../config/stripeConfig';
import { MembershipPlan } from '../types/auth';
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

type PaymentSessionResponse = StripePaymentSession & {
  publishableKey?: string;
  paymentIntentId?: string;
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
    headers.Authorization = `Bearer ${token}`;
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

export const fetchMembershipPlans = async (
  token?: string,
): Promise<MembershipPlan[]> => {
  const requestInit = await buildWordPressRequestInit({
    method: 'GET',
    headers: buildHeaders(token),
  });
  const response = await fetch(
    `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.plans}`,
    requestInit,
  );
  await syncWordPressCookiesFromResponse(response);

  const payload = await handleResponse<
    MembershipPlansResponse | MembershipPlan[]
  >(response);

  if (Array.isArray(payload)) {
    return normalizePlans(payload as WordPressMembershipPlan[]);
  }

  if (Array.isArray(payload.plans)) {
    return normalizePlans(payload.plans as WordPressMembershipPlan[]);
  }

  return [];
};

export const createMembershipPaymentSession = async (
  planId: string,
  token?: string,
): Promise<PaymentSessionResponse> => {
  const requestInit = await buildWordPressRequestInit({
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ planId }),
  });
  const response = await fetch(
    `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.createPaymentSession}`,
    requestInit,
  );
  await syncWordPressCookiesFromResponse(response);

  const payload = await handleResponse<PaymentSessionResponse>(response);

  if (
    !payload.paymentIntentClientSecret ||
    !payload.customerEphemeralKeySecret
  ) {
    throw new Error('Incomplete payment session details received.');
  }

  return payload;
};

export const confirmMembershipUpgrade = async (
  planId: string,
  token?: string,
): Promise<ConfirmUpgradeResponse> => {
  const requestInit = await buildWordPressRequestInit({
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ planId }),
  });
  const response = await fetch(
    `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.confirm}`,
    requestInit,
  );
  await syncWordPressCookiesFromResponse(response);

  const payload = await handleResponse<ConfirmUpgradeResponse>(response);
  return payload;
};
