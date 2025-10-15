export type ErrorSeverity = 'info' | 'warning' | 'error';

export interface ErrorDescriptor {
  /**
   * Stable identifier used across the app and documentation.
   */
  id: string;
  /**
    * Short human friendly code shown to end users.
    */
  code: string;
  /**
   * Default English message used when no localization override exists.
   */
  defaultMessage: string;
  /**
   * Developer focused description explaining what the error means or how to investigate.
   */
  description: string;
  /**
   * Optional translation key that maps to the localized copy.
   */
  translationKey?: string;
  /**
   * Optional HTTP status for API surfaced errors.
   */
  httpStatus?: number;
  severity?: ErrorSeverity;
}

export const ERROR_CATALOG = {
  UNKNOWN: {
    id: 'UNKNOWN',
    code: 'E1000',
    defaultMessage: 'An unexpected error occurred.',
    description:
      'Generic fallback for unexpected failures where a more specific error code is not yet assigned.',
    translationKey: 'errors.generic',
  },
  AUTH_PASSWORD_LOGIN_FAILED: {
    id: 'AUTH_PASSWORD_LOGIN_FAILED',
    code: 'E2000',
    defaultMessage: 'Unable to complete password login.',
    description:
      'Triggered when the WordPress password login flow fails or returns an invalid payload.',
    translationKey: 'errors.passwordLogin',
  },
  AUTH_PIN_INCORRECT: {
    id: 'AUTH_PIN_INCORRECT',
    code: 'E2001',
    defaultMessage: 'Incorrect PIN.',
    description: 'Raised when a user enters an incorrect quick login PIN.',
    translationKey: 'errors.incorrectPin',
  },
  AUTH_NO_SAVED_SESSION: {
    id: 'AUTH_NO_SAVED_SESSION',
    code: 'E2002',
    defaultMessage:
      'No saved session. Please log in with your password first.',
    description:
      'PIN login attempted without a stored session snapshot. User must log in with credentials first.',
    translationKey: 'errors.noSavedSession',
  },
  AUTH_PIN_LOGIN_FAILED: {
    id: 'AUTH_PIN_LOGIN_FAILED',
    code: 'E2003',
    defaultMessage: 'Unable to sign in with PIN.',
    description:
      'PIN login flow encountered an unexpected failure after PIN verification.',
    translationKey: 'errors.pinLogin',
  },
  AUTH_BIOMETRICS_UNAVAILABLE: {
    id: 'AUTH_BIOMETRICS_UNAVAILABLE',
    code: 'E2004',
    defaultMessage:
      'Biometric authentication is not available on this device.',
    description:
      'Raised when the device does not support Face ID / Touch ID / equivalent biometrics.',
    translationKey: 'errors.biometricsUnavailable',
  },
  AUTH_BIOMETRICS_CANCELLED: {
    id: 'AUTH_BIOMETRICS_CANCELLED',
    code: 'E2005',
    defaultMessage: 'Biometric authentication was cancelled.',
    description:
      'User dismissed biometric prompt before completion or OS cancelled it.',
    translationKey: 'errors.biometricsCancelled',
    severity: 'warning',
  },
  AUTH_BIOMETRIC_LOGIN_FAILED: {
    id: 'AUTH_BIOMETRIC_LOGIN_FAILED',
    code: 'E2006',
    defaultMessage: 'Unable to complete biometric login.',
    description:
      'Biometric authentication succeeded but session bootstrap failed.',
    translationKey: 'errors.biometricLogin',
  },
  AUTH_LOGIN_BEFORE_PIN_CREATION: {
    id: 'AUTH_LOGIN_BEFORE_PIN_CREATION',
    code: 'E2007',
    defaultMessage:
      'Please log in with your username and password before creating a PIN.',
    description:
      'User attempted to create a quick login PIN without first authenticating with credentials.',
    translationKey: 'errors.loginBeforePinCreation',
  },
  AUTH_LOGIN_BEFORE_PIN_SETTING: {
    id: 'AUTH_LOGIN_BEFORE_PIN_SETTING',
    code: 'E2008',
    defaultMessage:
      'You must log in with your password before setting a PIN.',
    description:
      'Session snapshot missing while persisting quick login PIN setup.',
    translationKey: 'errors.loginBeforePinSetting',
  },
  AUTH_LOGIN_BEFORE_PIN_CHANGE: {
    id: 'AUTH_LOGIN_BEFORE_PIN_CHANGE',
    code: 'E2009',
    defaultMessage:
      'Please log in with your username and password before changing your PIN.',
    description:
      'User attempted to modify their quick login PIN without an authenticated session.',
    translationKey: 'errors.loginBeforePinChange',
  },
  AUTH_PIN_LENGTH: {
    id: 'AUTH_PIN_LENGTH',
    code: 'E2010',
    defaultMessage: 'PIN must contain at least 4 digits.',
    description: 'Validation guard ensuring chosen PIN meets minimum length.',
    translationKey: 'errors.pinLength',
  },
  AUTH_BIOMETRICS_NOT_CONFIGURED: {
    id: 'AUTH_BIOMETRICS_NOT_CONFIGURED',
    code: 'E2011',
    defaultMessage: 'Biometric authentication is not configured.',
    description:
      'Quick login biometrics attempted before the user finished enabling the feature.',
    translationKey: 'errors.biometricsNotConfigured',
  },
  AUTH_WORDPRESS_CREDENTIALS: {
    id: 'AUTH_WORDPRESS_CREDENTIALS',
    code: 'E2012',
    defaultMessage: 'Unable to log in with WordPress credentials.',
    description:
      'Fallback error when the WordPress REST login endpoint fails or returns invalid data.',
    translationKey: 'errors.wordpressCredentials',
  },
  AUTH_PIN_SAVE_FAILED: {
    id: 'AUTH_PIN_SAVE_FAILED',
    code: 'E2013',
    defaultMessage: 'Something went wrong while saving your PIN.',
    description:
      'Persisting a quick login PIN to secure storage failed unexpectedly.',
    translationKey: 'errors.pinSaveGeneric',
  },
  AUTH_PIN_REMOVE_FAILED: {
    id: 'AUTH_PIN_REMOVE_FAILED',
    code: 'E2014',
    defaultMessage: 'Something went wrong while removing your PIN.',
    description:
      'Clearing a quick login PIN from secure storage failed unexpectedly.',
    translationKey: 'errors.pinRemoveGeneric',
  },
  AUTH_PASSWORD_RESET_EMAIL_FAILED: {
    id: 'AUTH_PASSWORD_RESET_EMAIL_FAILED',
    code: 'E2015',
    defaultMessage: 'Unable to send password reset email.',
    description:
      'WordPress reset password email helper returned an error or network failure occurred.',
    translationKey: 'errors.passwordReset',
  },
  AUTH_RESET_PASSWORD_FAILED: {
    id: 'AUTH_RESET_PASSWORD_FAILED',
    code: 'E2016',
    defaultMessage: 'Unable to reset password.',
    description:
      'Reset password confirmation endpoint failed validation or returned an error.',
    translationKey: 'errors.resetPassword',
  },
  AUTH_REGISTER_ACCOUNT_FAILED: {
    id: 'AUTH_REGISTER_ACCOUNT_FAILED',
    code: 'E2017',
    defaultMessage: 'Unable to register a new account.',
    description:
      'Registration endpoint returned an error, usually due to validation or server failure.',
    translationKey: 'errors.registerAccount',
  },
  AUTH_PASSWORD_MISMATCH: {
    id: 'AUTH_PASSWORD_MISMATCH',
    code: 'E2018',
    defaultMessage: 'Passwords do not match.',
    description: 'Client side validation preventing mismatched passwords.',
    translationKey: 'errors.passwordMismatch',
    severity: 'warning',
  },
  AUTH_VENDOR_TIER_REQUIRED: {
    id: 'AUTH_VENDOR_TIER_REQUIRED',
    code: 'E2019',
    defaultMessage: 'Please select a vendor tier.',
    description:
      'Vendor registration requires a tier selection; this guard triggers when none picked.',
    translationKey: 'errors.vendorTierRequired',
    severity: 'warning',
  },
  AUTH_CHANGE_PASSWORD_FAILED: {
    id: 'AUTH_CHANGE_PASSWORD_FAILED',
    code: 'E2020',
    defaultMessage: 'Unable to change password.',
    description:
      'WordPress password change endpoint rejected the request or failed.',
    translationKey: 'errors.changePassword',
  },
  AUTH_PIN_MISMATCH: {
    id: 'AUTH_PIN_MISMATCH',
    code: 'E2021',
    defaultMessage: 'PIN entries do not match.',
    description: 'Client validation ensuring PIN confirmation matches.',
    translationKey: 'errors.pinMismatch',
    severity: 'warning',
  },
  AUTH_VENDOR_PENDING: {
    id: 'AUTH_VENDOR_PENDING',
    code: 'E2022',
    defaultMessage: 'Your vendor account is pending approval.',
    description:
      'Vendor login blocked because the account is not yet approved.',
    translationKey: 'errors.vendorPending',
  },
  AUTH_VENDOR_REJECTED: {
    id: 'AUTH_VENDOR_REJECTED',
    code: 'E2023',
    defaultMessage: 'Your vendor application has been rejected.',
    description: 'Vendor was denied by admin; login is blocked.',
    translationKey: 'errors.vendorRejected',
  },
  AUTH_VENDOR_SUSPENDED: {
    id: 'AUTH_VENDOR_SUSPENDED',
    code: 'E2024',
    defaultMessage:
      'Your vendor account has been suspended. Contact support for assistance.',
    description: 'Vendor suspended due to compliance or billing issues.',
    translationKey: 'errors.vendorSuspended',
  },
  AUTH_IMAGE_SELECTION_REQUIRED: {
    id: 'AUTH_IMAGE_SELECTION_REQUIRED',
    code: 'E2025',
    defaultMessage: 'A valid image selection is required.',
    description:
      'Profile avatar upload attempted without an image selection or with an invalid payload.',
  },
  PROFILE_AVATAR_UPDATE_FAILED: {
    id: 'PROFILE_AVATAR_UPDATE_FAILED',
    code: 'E2026',
    defaultMessage: 'Unable to update profile photo.',
    description:
      'Profile avatar upload to WordPress failed due to a network or server error.',
    translationKey: 'profile.avatar.errors.updateFailed',
  },
  PROFILE_AVATAR_REMOVE_FAILED: {
    id: 'PROFILE_AVATAR_REMOVE_FAILED',
    code: 'E2027',
    defaultMessage: 'Unable to remove profile photo.',
    description:
      'Profile avatar removal request failed or returned an error response.',
    translationKey: 'profile.avatar.errors.removeFailed',
  },
  AUTH_MEMBER_QR_VALIDATE_FAILED: {
    id: 'AUTH_MEMBER_QR_VALIDATE_FAILED',
    code: 'E2028',
    defaultMessage: 'Unable to validate member QR code.',
    description:
      'Member QR validation endpoint rejected the request or returned an error.',
  },
  AUTH_LOGIN_MISSING_CREDENTIALS: {
    id: 'AUTH_LOGIN_MISSING_CREDENTIALS',
    code: 'E2029',
    defaultMessage: 'A username or email address and password are required.',
    description:
      'Login endpoint rejected the request because required fields were missing.',
  },
  AUTH_LOGIN_RATE_LIMITED: {
    id: 'AUTH_LOGIN_RATE_LIMITED',
    code: 'E2030',
    defaultMessage: 'Too many attempts. Try again shortly.',
    description:
      'Login attempts exceeded the allowed threshold.',
  },
  AUTH_ACCOUNT_SUSPENDED: {
    id: 'AUTH_ACCOUNT_SUSPENDED',
    code: 'E2031',
    defaultMessage: 'Your account is suspended. Contact support for assistance.',
    description:
      'Account is suspended and cannot be used for authentication.',
  },
  SECURE_CREDENTIAL_STORE_FAILED: {
    id: 'SECURE_CREDENTIAL_STORE_FAILED',
    code: 'E1001',
    defaultMessage: 'Unable to store secure credential.',
    description:
      'Persisting data inside the encrypted storage failed.',
  },
  SESSION_TOKEN_UNAVAILABLE: {
    id: 'SESSION_TOKEN_UNAVAILABLE',
    code: 'E3000',
    defaultMessage: 'Authentication token is unavailable.',
    description:
      'Client attempted to call a protected API without an authentication token in memory or storage.',
  },
  MEMBERSHIP_PAYMENT_SECRET_MISSING: {
    id: 'MEMBERSHIP_PAYMENT_SECRET_MISSING',
    code: 'E3001',
    defaultMessage: 'Missing payment intent client secret.',
    description:
      'Stripe payment confirmation attempted without the expected client secret from the backend.',
  },
  MEMBERSHIP_PLANS_FETCH_FAILED: {
    id: 'MEMBERSHIP_PLANS_FETCH_FAILED',
    code: 'E3002',
    defaultMessage: 'Unable to load membership plans.',
    description:
      'Fetching the available membership plans from WordPress failed or returned an invalid payload.',
    translationKey: 'membership.screen.loadError',
  },
  MEMBERSHIP_PAYMENT_SESSION_FAILED: {
    id: 'MEMBERSHIP_PAYMENT_SESSION_FAILED',
    code: 'E3003',
    defaultMessage: 'Unable to start the membership checkout session.',
    description:
      'Creating a Stripe Payment Intent or checkout session failed.',
    translationKey: 'membership.screen.checkoutError',
  },
  MEMBERSHIP_PAYMENT_PRESENT_FAILED: {
    id: 'MEMBERSHIP_PAYMENT_PRESENT_FAILED',
    code: 'E3004',
    defaultMessage: 'Unable to present the payment sheet.',
    description:
      'Stripe PaymentSheet present call returned an error.',
    translationKey: 'membership.screen.checkoutError',
  },
  MEMBERSHIP_CONFIRM_FAILED: {
    id: 'MEMBERSHIP_CONFIRM_FAILED',
    code: 'E3005',
    defaultMessage: 'Unable to confirm the membership upgrade.',
    description:
      'Confirming the membership upgrade with WordPress failed.',
    translationKey: 'membership.screen.checkoutError',
  },
  MEMBERSHIP_CHECKOUT_FAILED: {
    id: 'MEMBERSHIP_CHECKOUT_FAILED',
    code: 'E3006',
    defaultMessage: 'Something went wrong while processing your payment.',
    description:
      'Generic fallback when the membership checkout flow fails.',
    translationKey: 'membership.screen.checkoutError',
  },
  TRANSACTION_FETCH_FAILED: {
    id: 'TRANSACTION_FETCH_FAILED',
    code: 'E3100',
    defaultMessage: 'Unable to load transactions.',
    description:
      'Fetching member or vendor transaction analytics failed.',
    translationKey: 'analytics.errors.fetch',
  },
  TRANSACTION_RECORD_FAILED: {
    id: 'TRANSACTION_RECORD_FAILED',
    code: 'E3101',
    defaultMessage: 'Unable to record transaction.',
    description:
      'Recording a vendor transaction or discount application failed.',
    translationKey: 'vendor.screen.transaction.errors.submit',
  },
  TRANSACTION_MEMBER_LOOKUP_FAILED: {
    id: 'TRANSACTION_MEMBER_LOOKUP_FAILED',
    code: 'E3102',
    defaultMessage: 'Unable to look up member details.',
    description:
      'Fetching member eligibility or discount details failed.',
  },
  TRANSACTION_DISCOUNT_REFRESH_FAILED: {
    id: 'TRANSACTION_DISCOUNT_REFRESH_FAILED',
    code: 'E3103',
    defaultMessage: 'Unable to refresh discount information.',
    description:
      'Discount recalculation or descriptor refresh failed.',
  },
  TRANSACTION_HISTORY_FETCH_FAILED: {
    id: 'TRANSACTION_HISTORY_FETCH_FAILED',
    code: 'E3104',
    defaultMessage: 'Unable to load transaction history.',
    description:
      'Fetching member or vendor transaction history failed.',
    translationKey: 'analytics.errors.fetch',
  },
  ADMIN_DASHBOARD_LOAD_FAILED: {
    id: 'ADMIN_DASHBOARD_LOAD_FAILED',
    code: 'E3200',
    defaultMessage: 'Unable to load admin data.',
    description:
      'Fetching admin dashboard data failed.',
    translationKey: 'admin.dashboard.errors.load',
  },
  ADMIN_VENDOR_APPROVE_FAILED: {
    id: 'ADMIN_VENDOR_APPROVE_FAILED',
    code: 'E3201',
    defaultMessage: 'Unable to approve the vendor.',
    description:
      'Approving a vendor application failed.',
    translationKey: 'admin.dashboard.errors.approve',
  },
  ADMIN_VENDOR_REJECT_FAILED: {
    id: 'ADMIN_VENDOR_REJECT_FAILED',
    code: 'E3202',
    defaultMessage: 'Unable to reject the vendor.',
    description:
      'Rejecting a vendor application failed.',
    translationKey: 'admin.dashboard.errors.reject',
  },
  REGISTER_VENDOR_TIER_FETCH_FAILED: {
    id: 'REGISTER_VENDOR_TIER_FETCH_FAILED',
    code: 'E3300',
    defaultMessage:
      'Unable to load the latest vendor tiers. Default options are shown below.',
    description:
      'Fetching vendor tiers for the registration modal failed.',
    translationKey: 'auth.registerModal.vendorTierError',
  },
  VENDOR_TIERS_FETCH_FAILED: {
    id: 'VENDOR_TIERS_FETCH_FAILED',
    code: 'E3301',
    defaultMessage: 'Unable to load vendor tiers.',
    description:
      'Vendor tier list endpoint failed or returned an invalid payload.',
  },
  NOTIFICATIONS_APP_ID_MISSING: {
    id: 'NOTIFICATIONS_APP_ID_MISSING',
    code: 'E4000',
    defaultMessage: 'ONESIGNAL_APP_ID is not configured.',
    description:
      'OneSignal provider initialized without the required app identifier environment variable.',
  },
  CRYPTO_RANDOM_UNAVAILABLE: {
    id: 'CRYPTO_RANDOM_UNAVAILABLE',
    code: 'E5000',
    defaultMessage: 'Secure random number generator is not available.',
    description:
      'Crypto.getRandomValues failed or is unavailable on the current platform.',
  },
  PROVIDER_ONESIGNAL_MISSING: {
    id: 'PROVIDER_ONESIGNAL_MISSING',
    code: 'E9000',
    defaultMessage:
      'useOneSignalNotifications must be used within a OneSignalProvider.',
    description:
      'Developer integration error: hook invoked without wrapping provider.',
    severity: 'error',
  },
  PROVIDER_TOKEN_LOGIN_MISSING: {
    id: 'PROVIDER_TOKEN_LOGIN_MISSING',
    code: 'E9001',
    defaultMessage:
      'useTokenLogin must be used within TokenLoginProvider.',
    description:
      'Developer integration error: TokenLogin hook used outside its provider scope.',
    severity: 'error',
  },
  PROVIDER_TRANSACTION_MISSING: {
    id: 'PROVIDER_TRANSACTION_MISSING',
    code: 'E9002',
    defaultMessage:
      'useTransactionContext must be used within a TransactionProvider',
    description:
      'Developer integration error: Transaction hook used without provider.',
    severity: 'error',
  },
  PROVIDER_AUTH_MISSING: {
    id: 'PROVIDER_AUTH_MISSING',
    code: 'E9003',
    defaultMessage: 'useAuthContext must be used within an AuthProvider.',
    description:
      'Developer integration error: Auth hook accessed outside provider chain.',
    severity: 'error',
  },
  PROVIDER_LOCALIZATION_MISSING: {
    id: 'PROVIDER_LOCALIZATION_MISSING',
    code: 'E9004',
    defaultMessage: 'useLocalization must be used within a LocalizationProvider.',
    description:
      'Developer integration error: Localization hook accessed outside provider chain.',
    severity: 'error',
  },
} as const satisfies Record<string, ErrorDescriptor>;

export type ErrorId = keyof typeof ERROR_CATALOG;

export const getErrorDescriptor = (id: ErrorId): ErrorDescriptor => {
  return ERROR_CATALOG[id] ?? ERROR_CATALOG.UNKNOWN;
};
