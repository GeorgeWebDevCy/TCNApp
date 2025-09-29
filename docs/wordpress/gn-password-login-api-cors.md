# GN Password Login API CORS Hook Fix

The GN Password Login API plugin (as of v1.0.1) registers a custom `rest_pre_serve_request` filter without declaring that it accepts all of the arguments that WordPress provides. WordPress therefore only passes the first parameter (`$served`), which triggers an `ArgumentCountError` when the plugin's `cors_headers()` method expects four parameters.

## Patch

Update the filter registration so WordPress forwards the full argument list:

```php
// In gn-password-login-api.php inside GN_Password_Login_API::register_routes()
remove_filter('rest_pre_serve_request', 'rest_send_cors_headers');
add_filter('rest_pre_serve_request', [$this, 'cors_headers'], 10, 4);
```

The `10` is the priority (WordPress' default) and `4` tells WordPress to pass all four arguments (`$served`, `$result`, `$request`, `$server`) to the callback. After making this change the REST endpoint will execute without the fatal error and the plugin will continue to manage its custom CORS headers correctly.

If you prefer using a patch file, apply the diff stored at `docs/wordpress/patches/gn-password-login-api-cors.patch`.
