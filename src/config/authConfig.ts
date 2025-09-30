const BASE_URL = 'https://dominicb72.sg-host.com';

export const WORDPRESS_CONFIG = {
  baseUrl: BASE_URL,
  endpoints: {
    passwordLogin: '/wp-json/gn/v1/login',
    profile: '/wp-json/wp/v2/users/me',
    changePassword: '/wp-json/gn/v1/change-password',
    passwordReset: '/wp-json/gn/v1/forgot-password',
    directPasswordReset: '/wp-json/gn/v1/reset-password',
    register: '/wp-json/gn/v1/register',
  },
  links: {
    register: `${BASE_URL}/register`,
    forgotPassword: `${BASE_URL}/wp-login.php?action=lostpassword`,
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
};
