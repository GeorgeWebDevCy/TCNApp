# Error Code Directory

This directory lists every public-facing error used by the TCN mobile app and the companion WordPress plugin. Each row links the numeric code (`E####`) to the internal identifier, default English message, behaviour description, and the systems that surface it. When adding new errors, update this table and ensure translations exist for any `translationKey`.

| Code | Identifier | Default Message | Description | Translation Key | Plugin Usage |
| --- | --- | --- | --- | --- | --- |
| E1000 | UNKNOWN | An unexpected error occurred. | Generic fallback when no specific error code applies. | errors.generic | App |
| E2000 | AUTH_PASSWORD_LOGIN_FAILED | Unable to complete password login. | WordPress password login failed or returned an invalid payload. | errors.passwordLogin | App + Plugin |
| E2001 | AUTH_PIN_INCORRECT | Incorrect PIN. | Raised when a user enters an incorrect quick login PIN. | errors.incorrectPin | App |
| E2002 | AUTH_NO_SAVED_SESSION | No saved session. Please log in with your password first. | PIN or biometric login attempted without an unlocked session snapshot. | errors.noSavedSession | App |
| E2003 | AUTH_PIN_LOGIN_FAILED | Unable to sign in with PIN. | PIN login flow encountered an unexpected failure. | errors.pinLogin | App |
| E2004 | AUTH_BIOMETRICS_UNAVAILABLE | Biometric authentication is not available on this device. | Device does not support the requested biometric method. | errors.biometricsUnavailable | App |
| E2005 | AUTH_BIOMETRICS_CANCELLED | Biometric authentication was cancelled. | User dismissed the biometric prompt before completion. | errors.biometricsCancelled | App |
| E2006 | AUTH_BIOMETRIC_LOGIN_FAILED | Unable to complete biometric login. | Biometric authentication succeeded but session bootstrap failed. | errors.biometricLogin | App |
| E2007 | AUTH_LOGIN_BEFORE_PIN_CREATION | Please log in with your username and password before creating a PIN. | Prevents creating a quick login PIN before a password session. | errors.loginBeforePinCreation | App |
| E2008 | AUTH_LOGIN_BEFORE_PIN_SETTING | You must log in with your password before setting a PIN. | Guard when the app has no stored session snapshot. | errors.loginBeforePinSetting | App |
| E2009 | AUTH_LOGIN_BEFORE_PIN_CHANGE | Please log in with your username and password before changing your PIN. | Requires password re-auth before updating or removing a PIN. | errors.loginBeforePinChange | App |
| E2010 | AUTH_PIN_LENGTH | PIN must contain at least 4 digits. | Validation guard ensuring chosen PIN meets minimum length. | errors.pinLength | App |
| E2011 | AUTH_BIOMETRICS_NOT_CONFIGURED | Biometric authentication is not configured. |  | errors.biometricsNotConfigured | App |
| E2012 | AUTH_WORDPRESS_CREDENTIALS | Unable to log in with WordPress credentials. | WordPress rejected the supplied username/password/email combination. | errors.wordpressCredentials | App + Plugin |
| E2013 | AUTH_PIN_SAVE_FAILED | Something went wrong while saving your PIN. |  | errors.pinSaveGeneric | App |
| E2014 | AUTH_PIN_REMOVE_FAILED | Something went wrong while removing your PIN. |  | errors.pinRemoveGeneric | App |
| E2015 | AUTH_PASSWORD_RESET_EMAIL_FAILED | Unable to send password reset email. |  | errors.passwordReset | App + Plugin |
| E2016 | AUTH_RESET_PASSWORD_FAILED | Unable to reset password. |  | errors.resetPassword | App + Plugin |
| E2017 | AUTH_REGISTER_ACCOUNT_FAILED | Unable to register a new account. |  | errors.registerAccount | App + Plugin |
| E2018 | AUTH_PASSWORD_MISMATCH | Passwords do not match. | Client side validation preventing mismatched passwords. | errors.passwordMismatch | App |
| E2019 | AUTH_VENDOR_TIER_REQUIRED | Please select a vendor tier. |  | errors.vendorTierRequired | App |
| E2020 | AUTH_CHANGE_PASSWORD_FAILED | Unable to change password. |  | errors.changePassword | App + Plugin |
| E2021 | AUTH_PIN_MISMATCH | PIN entries do not match. | Client validation ensuring PIN confirmation matches. | errors.pinMismatch | App |
| E2022 | AUTH_VENDOR_PENDING | Your vendor account is pending approval. |  | errors.vendorPending | App + Plugin |
| E2023 | AUTH_VENDOR_REJECTED | Your vendor application has been rejected. | Vendor was denied by admin; login is blocked. | errors.vendorRejected | App + Plugin |
| E2024 | AUTH_VENDOR_SUSPENDED | Your vendor account has been suspended. Contact support for assistance. | Vendor suspended due to compliance or billing issues. | errors.vendorSuspended | App + Plugin |
| E2025 | AUTH_IMAGE_SELECTION_REQUIRED | A valid image selection is required. | Profile avatar upload was attempted without a valid image payload. | — | App |
| E2026 | PROFILE_AVATAR_UPDATE_FAILED | Unable to update profile photo. |  | profile.avatar.errors.updateFailed | App |
| E2027 | PROFILE_AVATAR_REMOVE_FAILED | Unable to remove profile photo. |  | profile.avatar.errors.removeFailed | App |
| E2028 | AUTH_MEMBER_QR_VALIDATE_FAILED | Unable to validate member QR code. | Member QR validation endpoint rejected the supplied token. | — | App |
| E2029 | AUTH_LOGIN_MISSING_CREDENTIALS | A username or email address and password are required. | Login attempt omitted one or more required fields. | — | App + Plugin |
| E2030 | AUTH_LOGIN_RATE_LIMITED | Too many attempts. Try again shortly. | Login endpoint throttled due to repeated failures. | — | App + Plugin |
| E2031 | AUTH_ACCOUNT_SUSPENDED | Your account is suspended. Contact support for assistance. | Authentication blocked because the account is suspended. | — | App + Plugin |
| E1001 | SECURE_CREDENTIAL_STORE_FAILED | Unable to store secure credential. | Persisting encrypted data to device storage failed. | — | App |
| E3000 | SESSION_TOKEN_UNAVAILABLE | Authentication token is unavailable. |  | — | App + Plugin |
| E3001 | MEMBERSHIP_PAYMENT_SECRET_MISSING | Missing payment intent client secret. |  | — | App |
| E3002 | MEMBERSHIP_PLANS_FETCH_FAILED | Unable to load membership plans. |  | membership.screen.loadError | App |
| E3003 | MEMBERSHIP_PAYMENT_SESSION_FAILED | Unable to start the membership checkout session. |  | membership.screen.checkoutError | App + Plugin |
| E3004 | MEMBERSHIP_PAYMENT_PRESENT_FAILED | Unable to present the payment sheet. |  | membership.screen.checkoutError | App |
| E3005 | MEMBERSHIP_CONFIRM_FAILED | Unable to confirm the membership upgrade. |  | membership.screen.checkoutError | App + Plugin |
| E3006 | MEMBERSHIP_CHECKOUT_FAILED | Something went wrong while processing your payment. |  | membership.screen.checkoutError | App + Plugin |
| E3100 | TRANSACTION_FETCH_FAILED | Unable to load transactions. |  | analytics.errors.fetch | App |
| E3101 | TRANSACTION_RECORD_FAILED | Unable to record transaction. |  | vendor.screen.transaction.errors.submit | App |
| E3102 | TRANSACTION_MEMBER_LOOKUP_FAILED | Unable to look up member details. |  | — | App |
| E3103 | TRANSACTION_DISCOUNT_REFRESH_FAILED | Unable to refresh discount information. |  | — | App |
| E3104 | TRANSACTION_HISTORY_FETCH_FAILED | Unable to load transaction history. |  | analytics.errors.fetch | App |
| E3200 | ADMIN_DASHBOARD_LOAD_FAILED | Unable to load admin data. |  | admin.dashboard.errors.load | App |
| E3201 | ADMIN_VENDOR_APPROVE_FAILED | Unable to approve the vendor. |  | admin.dashboard.errors.approve | App |
| E3202 | ADMIN_VENDOR_REJECT_FAILED | Unable to reject the vendor. |  | admin.dashboard.errors.reject | App |
| E3300 | REGISTER_VENDOR_TIER_FETCH_FAILED |  |  | auth.registerModal.vendorTierError | App + Plugin |
| E3301 | VENDOR_TIERS_FETCH_FAILED | Unable to load vendor tiers. |  | — | App + Plugin |
| E4000 | NOTIFICATIONS_APP_ID_MISSING | ONESIGNAL_APP_ID is not configured. |  | — | App |
| E5000 | CRYPTO_RANDOM_UNAVAILABLE | Secure random number generator is not available. |  | — | App |
| E9000 | PROVIDER_ONESIGNAL_MISSING |  |  | — | App |
| E9001 | PROVIDER_TOKEN_LOGIN_MISSING |  |  | — | App |
| E9002 | PROVIDER_TRANSACTION_MISSING |  |  | — | App |
| E9003 | PROVIDER_AUTH_MISSING | useAuthContext must be used within an AuthProvider. |  | — | App |
| E9004 | PROVIDER_LOCALIZATION_MISSING | useLocalization must be used within a LocalizationProvider. |  | — | App |
