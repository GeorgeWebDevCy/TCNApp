export const STRIPE_CONFIG = {
  publishableKey:
    process.env.STRIPE_PUBLISHABLE_KEY ??
    'pk_test_replace_with_publishable_key',
  merchantDisplayName: 'Thai Coupon Network',
  merchantIdentifier: 'merchant.com.thai.coupon.network',
  urlScheme: 'tcnapp',
};

export type StripePaymentSession = {
  paymentIntentClientSecret: string;
  customerId: string;
  customerEphemeralKeySecret: string;
};
