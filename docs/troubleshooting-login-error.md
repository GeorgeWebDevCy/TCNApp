# Troubleshooting: "Class `TCN\\Platform\\Support\\ErrorCodes` not found"

When the `scripts/full_flow_smoke.sh` helper attempts to authenticate against the
staging WordPress instance it calls the `/wp-json/gn/v1/login` REST endpoint. In
the captured run this endpoint responded with HTTP status `500` and the
WordPress fatal error:

```
Uncaught Error: Class "TCN\Platform\Support\ErrorCodes" not found in
/home/customer/www/dominicb72.sg-host.com/public_html/wp-content/plugins/tcnapp-connector/includes/Auth/PasswordLoginService.php:308
```

## Why the error happens

The WordPress plugin uses the `TCN\Platform\Support\ErrorCodes` helper to build
`WP_Error` responses. The helper **does** exist inside this repository at
[`includes/Support/ErrorCodes.php`](../includes/Support/ErrorCodes.php), but
WordPress only knows about PHP classes that are loaded through Composer (via
`vendor/autoload.php`) or manually required. If the production plugin bundle
omits the file or the autoloader is misconfigured, the login endpoint crashes
before it can return a JSON error payload.

In short: the site is running plugin code that references the `ErrorCodes`
class, but the PHP runtime never loads it, so PHP throws a fatal "class not
found" error and WordPress returns an HTTP 500.

## How to fix it

1. **Ensure the class is shipped.** Confirm that the deployed plugin contains
   `includes/Support/ErrorCodes.php`. If it is missing, rebuild the plugin (e.g.
   `composer install && composer dump-autoload`) and redeploy.
2. **Verify the autoloader.** Make sure `TCN\\Platform\\Support\\ErrorCodes`
   is mapped in Composer's autoload section. Running `composer dump-autoload`
   after adding new files ensures the autoloader knows about them.
3. **Fallback require.** If Composer is not available in production, add a
   manual `require_once __DIR__ . '/../Support/ErrorCodes.php';` at the top of
   `PasswordLoginService.php` so the class is always loaded.

Once the class can be autoloaded, the login endpoint returns the expected JSON
error codes instead of throwing a fatal error, and the smoke test proceeds to
later steps.
