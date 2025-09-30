import { WORDPRESS_CONFIG } from './authConfig';

export const MEMBERSHIP_CONFIG = {
  baseUrl: WORDPRESS_CONFIG.baseUrl,
  endpoints: {
    plans: '/wp-json/gn/v1/memberships/plans',
    createPaymentSession: '/wp-json/gn/v1/memberships/stripe-intent',
    confirm: '/wp-json/gn/v1/memberships/confirm',
  },
};
