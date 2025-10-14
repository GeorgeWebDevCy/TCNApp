<?php
namespace TCN\Platform\Support;

use WP_Error;

class ErrorCodes {
    public const UNKNOWN = 'E1000';
    public const SECURE_CREDENTIAL_STORE_FAILED = 'E1001';

    public const AUTH_PASSWORD_LOGIN_FAILED = 'E2000';
    public const AUTH_WORDPRESS_CREDENTIALS = 'E2012';
    public const AUTH_REGISTER_ACCOUNT_FAILED = 'E2017';
    public const AUTH_CHANGE_PASSWORD_FAILED = 'E2020';
    public const AUTH_VENDOR_PENDING = 'E2022';
    public const AUTH_VENDOR_REJECTED = 'E2023';
    public const AUTH_VENDOR_SUSPENDED = 'E2024';
    public const AUTH_IMAGE_SELECTION_REQUIRED = 'E2025';
    public const PROFILE_AVATAR_UPDATE_FAILED = 'E2026';
    public const PROFILE_AVATAR_REMOVE_FAILED = 'E2027';
    public const AUTH_MEMBER_QR_VALIDATE_FAILED = 'E2028';
    public const AUTH_LOGIN_MISSING_CREDENTIALS = 'E2029';
    public const AUTH_LOGIN_RATE_LIMITED = 'E2030';
    public const AUTH_ACCOUNT_SUSPENDED = 'E2031';
    public const AUTH_PASSWORD_RESET_EMAIL_FAILED = 'E2015';
    public const AUTH_RESET_PASSWORD_FAILED = 'E2016';

    public const SESSION_TOKEN_UNAVAILABLE = 'E3000';
    public const MEMBERSHIP_PAYMENT_SECRET_MISSING = 'E3001';
    public const MEMBERSHIP_PAYMENT_SESSION_FAILED = 'E3003';
    public const MEMBERSHIP_CONFIRM_FAILED = 'E3005';
    public const MEMBERSHIP_CHECKOUT_FAILED = 'E3006';

    public const TRANSACTION_RECORD_FAILED = 'E3101';
    public const TRANSACTION_MEMBER_LOOKUP_FAILED = 'E3102';
    public const TRANSACTION_DISCOUNT_REFRESH_FAILED = 'E3103';
    public const TRANSACTION_HISTORY_FETCH_FAILED = 'E3104';

    public const ADMIN_DASHBOARD_LOAD_FAILED = 'E3200';
    public const ADMIN_VENDOR_APPROVE_FAILED = 'E3201';
    public const ADMIN_VENDOR_REJECT_FAILED = 'E3202';

    public const REGISTER_VENDOR_TIER_FETCH_FAILED = 'E3300';
    public const VENDOR_TIERS_FETCH_FAILED = 'E3301';

    /**
     * Create a WP_Error instance that carries a platform error code.
     *
     * @param string               $code    Platform error code (e.g. E2000).
     * @param string               $message Human readable message.
     * @param int                  $status  HTTP status to surface via the REST API.
     * @param array<string, mixed> $data    Optional extra data to append to the error response.
     */
    public static function to_wp_error( string $code, string $message, int $status = 400, array $data = array() ): WP_Error {
        $payload = array_merge(
            $data,
            array(
                'status'     => $status,
                'error_code' => $code,
            )
        );

        return new WP_Error( $code, $message, $payload );
    }
}
