# Post-login diagnostics troubleshooting

The app runs a post-login diagnostic screen after the password flow to confirm the WordPress
backend is configured correctly before members continue. The checks run sequentially and stop as
soon as one fails, so a failure near the top of the list will block the remaining steps.

## What the screen tests

1. **Server connection** – Fetches `<baseUrl>/wp-json` to make sure the WordPress REST API is
   reachable from the device. Network errors, HTTP timeouts, or non-200 responses here normally
   mean the base URL in `WORDPRESS_CONFIG.baseUrl` is wrong or the server/firewall is blocking the
   request.【F:src/screens/PostLoginDiagnosticsScreen.tsx†L301-L372】【F:src/config/authConfig.ts†L1-L57】
2. **Authentication token** – Calls `getSessionToken()` and expects the login response to have
   produced an `api_token` that can be reused for future REST calls. When the check prints “No token
   was returned for this session” it means the WordPress site did not issue a bearer token after the
   password login, so every authenticated request will fail.【F:src/screens/PostLoginDiagnosticsScreen.tsx†L374-L433】
3. **Token lifetime** – Decodes the JWT payload to confirm the expiry is roughly seven days, matching
   the defaults in the Password Login API module. Large mismatches usually mean the server-side
   filters that modify expiry were changed or the site returned an opaque token instead of the
   expected JWT.【F:src/screens/PostLoginDiagnosticsScreen.tsx†L435-L520】【F:docs/wordpress/TCN_PLATFORM_REFERENCE.md†L24-L57】
4. **Protected endpoints** – Sends the token to `/wp-json/gn/v1/me` and expects a `200 OK`. Failures
   here usually mean CORS, HTTPS, or capability issues: the server rejected the bearer token even
   though it was issued earlier.【F:src/screens/PostLoginDiagnosticsScreen.tsx†L520-L610】【F:docs/wordpress/TCN_PLATFORM_REFERENCE.md†L28-L106】

## Fixing a missing authentication token

The most common reason the diagnostics stop with the token failure is that `/wp-json/gn/v1/login`
returned only a one-click login URL (`token_login_url`) without the long-lived `api_token`. The
mobile app relies on that bearer token for every protected route, so you need to make sure the
Password Login API module is returning the fields documented below.

1. **Verify the login response.** Use the API tester shipped with the WordPress plugin or a cURL
   request to call `POST /wp-json/gn/v1/login` and inspect the JSON payload. A healthy response looks
   like `{ success: true, user: {…}, token, api_token, expires_in, auth: {…} }`. If `api_token` is
   missing, update the plugin and confirm the Password Login service is active.【F:docs/wordpress/TCN_PLATFORM_REFERENCE.md†L28-L57】
2. **Check the plugin version and modules.** The unified TCN Platform plugin bundles the Password
   Login API service that mints the bearer token. Make sure that plugin (or the GN Password Login API
   plugin with the same service) is installed, activated, and not overridden by an outdated fork.
3. **Confirm credentials are accepted.** If the API tester shows `success: false`, the account may be
   locked or using an unexpected username/email. Resolve those issues first so the service can mint
   a token.
4. **Re-run the diagnostics.** After the backend returns an `api_token`, use the Retry button. The
   screen should progress through the lifetime and protected-endpoint checks and finish with “All
   systems operational.”

For automated smoke testing there are helper scripts under `scripts/`. They demonstrate how to log
in and extract the bearer token using either `jq` or plain `sed`, which is useful when confirming the
server’s JSON payload outside the app.【F:scripts/full_flow_smoke.sh†L205-L228】

## Other failure modes to watch for

- **Token lifetime mismatch:** custom filters on the server can shorten the JWT to less than seven
  days. Either adjust the tolerance in the app or restore the default lifetime so the mobile client
  knows when to refresh tokens.【F:src/screens/PostLoginDiagnosticsScreen.tsx†L492-L520】
- **Protected endpoint 401/403:** confirm the site allows REST bearer tokens over HTTPS and that the
  `/wp-json/gn/v1/me` route is enabled. Check server logs for `tcn_rest_unauthorized` entries when
  debugging.【F:docs/wordpress/TCN_PLATFORM_REFERENCE.md†L28-L106】

Use the diagnostic screen as a quick triage step: once all four checks are green, the app has
everything it needs to continue with authenticated flows.
