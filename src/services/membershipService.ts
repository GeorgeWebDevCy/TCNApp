import { MEMBERSHIP_CONFIG } from '../config/membershipConfig';
import { StripePaymentSession } from '../config/stripeConfig';
import { MembershipPlan } from '../types/auth';

type MembershipPlansResponse = {
  plans?: MembershipPlan[];
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

export const fetchMembershipPlans = async (
  token?: string,
): Promise<MembershipPlan[]> => {
  const response = await fetch(
    `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.plans}`,
    {
      method: 'GET',
      headers: buildHeaders(token),
    },
  );

  const payload = await handleResponse<
    MembershipPlansResponse | MembershipPlan[]
  >(response);

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.plans)) {
    return payload.plans as MembershipPlan[];
  }

  return [];
};

export const createMembershipPaymentSession = async (
  planId: string,
  token?: string,
): Promise<PaymentSessionResponse> => {
  const response = await fetch(
    `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.createPaymentSession}`,
    {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ planId }),
    },
  );

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
  const response = await fetch(
    `${MEMBERSHIP_CONFIG.baseUrl}${MEMBERSHIP_CONFIG.endpoints.confirm}`,
    {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ planId }),
    },
  );

  const payload = await handleResponse<ConfirmUpgradeResponse>(response);
  return payload;
};
