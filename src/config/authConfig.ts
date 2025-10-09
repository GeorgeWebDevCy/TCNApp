import {
  WORDPRESS_BASE_URL,
  WOOCOMMERCE_CONSUMER_KEY,
  WOOCOMMERCE_CONSUMER_SECRET,
} from '@env';

const sanitizeEnvValue = (value?: string): string =>
  value && typeof value === 'string' ? value.trim() : '';

const sanitizeBaseUrl = (value?: string): string => {
  const sanitized = sanitizeEnvValue(value);
  return sanitized.replace(/\/+$/u, '');
};

const BASE_URL =
  sanitizeBaseUrl(WORDPRESS_BASE_URL) || 'https://dominicb72.sg-host.com';

const WOOCOMMERCE_CONSUMER_KEY_VALUE = sanitizeEnvValue(
  WOOCOMMERCE_CONSUMER_KEY,
);
const WOOCOMMERCE_CONSUMER_SECRET_VALUE = sanitizeEnvValue(
  WOOCOMMERCE_CONSUMER_SECRET,
);

export const WORDPRESS_CONFIG = {
  baseUrl: BASE_URL,
  endpoints: {
    // Use GN/TCN connector login endpoint which returns api_token and token_login_url
    passwordLogin: '/wp-json/gn/v1/login',
    refreshToken: '/wp-json/jwt-auth/v1/token/refresh',
    validateToken: '/wp-json/jwt-auth/v1/token/validate',
    profile: '/wp-json/gn/v1/me',
    profileAvatar: '/wp-json/gn/v1/profile/avatar',
    changePassword: '/wp-json/gn/v1/change-password',
    passwordReset: '/wp-json/gn/v1/forgot-password',
    directPasswordReset: '/wp-json/gn/v1/reset-password',
    register: '/wp-json/gn/v1/register',
    membershipQr: '/wp-json/gn/v1/membership/qr',
    validateQr: '/wp-json/gn/v1/membership/qr/validate',
    admin: {
      accounts: '/wp-json/tcn/v1/admin/accounts',
      approveVendor: (vendorId: number | string) =>
        `/wp-json/tcn/v1/admin/vendors/${vendorId}/approve`,
      rejectVendor: (vendorId: number | string) =>
        `/wp-json/tcn/v1/admin/vendors/${vendorId}/reject`,
    },
  },
  links: {
    register: `${BASE_URL}/register`,
    forgotPassword: `${BASE_URL}/wp-login.php?action=lostpassword`,
  },
  woocommerce: {
    consumerKey: WOOCOMMERCE_CONSUMER_KEY_VALUE,
    consumerSecret: WOOCOMMERCE_CONSUMER_SECRET_VALUE,
  },
};

export const PIN_CONFIG = {
  storageKey: '@tcnapp/pin-hash',
  saltKey: '@tcnapp/pin-salt',
};

export const AUTH_STORAGE_KEYS = {
  token: '@tcnapp/wp-token',
  refreshToken: '@tcnapp/wp-refresh-token',
  userProfile: '@tcnapp/user-profile',
  sessionLock: '@tcnapp/session-locked',
  passwordAuthenticated: '@tcnapp/password-authenticated',
  tokenLoginUrl: '@tcnapp/wp-token-login-url',
  wpRestNonce: '@tcnapp/wp-rest-nonce',
  wordpressCookies: '@tcnapp/wp-cookies',
  woocommerceAuthHeader: '@tcnapp/woocommerce-basic-auth',
  credentialEmail: '@tcnapp/cred-email',
  credentialPassword: '@tcnapp/cred-password',
};
