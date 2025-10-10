import { STRIPE_PUBLISHABLE_KEY } from '@env';

const DEFAULT_PUBLISHABLE_KEY = 'pk_test_replace_with_publishable_key';
const sanitize = (v?: string) => (typeof v === 'string' ? v.trim() : '');
const PUBLISHABLE_KEY = sanitize(STRIPE_PUBLISHABLE_KEY) || DEFAULT_PUBLISHABLE_KEY;

export const STRIPE_CONFIG = {
  publishableKey: PUBLISHABLE_KEY,
  merchantDisplayName: 'Thai Coupon Network',
  merchantIdentifier: 'merchant.com.thai.coupon.network',
  urlScheme: 'tcnapp',
};

export type StripePaymentSession = {
  paymentIntentClientSecret: string;
  customerId: string;
  customerEphemeralKeySecret: string;
};
