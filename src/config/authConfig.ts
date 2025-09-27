export const WORDPRESS_CONFIG = {
  baseUrl: 'https://your-wordpress-site.com',
  endpoints: {
    token: '/wp-json/jwt-auth/v1/token',
    validate: '/wp-json/jwt-auth/v1/token/validate',
    profile: '/wp-json/wp/v2/users/me',
  },
  links: {
    register: 'https://your-wordpress-site.com/register',
    forgotPassword: 'https://your-wordpress-site.com/wp-login.php?action=lostpassword',
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
};
