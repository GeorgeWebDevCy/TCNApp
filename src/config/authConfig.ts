import {
  WOOCOMMERCE_CONSUMER_KEY,
  WOOCOMMERCE_CONSUMER_SECRET,
} from '@env';

const sanitizeEnvValue = (value?: string): string =>
  value && typeof value === 'string' ? value.trim() : '';

const BASE_URL = 'https://dominicb72.sg-host.com';

const WOOCOMMERCE_CONSUMER_KEY_VALUE = sanitizeEnvValue(
  WOOCOMMERCE_CONSUMER_KEY,
);
const WOOCOMMERCE_CONSUMER_SECRET_VALUE = sanitizeEnvValue(
  WOOCOMMERCE_CONSUMER_SECRET,
);

export const WORDPRESS_CONFIG = {
  baseUrl: BASE_URL,
  endpoints: {
    passwordLogin: '/wp-json/jwt-auth/v1/token',
    refreshToken: '/wp-json/jwt-auth/v1/token/refresh',
    validateToken: '/wp-json/jwt-auth/v1/token/validate',
    profile: '/wp-json/gn/v1/me',
    profileAvatar: '/wp-json/gn/v1/profile/avatar',
    changePassword: '/wp-json/gn/v1/change-password',
    changePasswordSql: '/wp-json/gn/v1/sql/change-password',
    passwordReset: '/wp-json/gn/v1/forgot-password',
    directPasswordReset: '/wp-json/gn/v1/reset-password',
    register: '/wp-json/gn/v1/register',
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
};
