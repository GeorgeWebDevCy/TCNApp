# WordPress Avatar Upload Endpoint

The mobile app now calls `POST /wp-json/gn/v1/profile/avatar` to upload a member's profile photo. The endpoint is expected to accept a `multipart/form-data` payload with an `avatar` field that contains the uploaded image file. A successful response must return the updated user profile in the same shape as `/wp-json/wp/v2/users/me` so the client can refresh the cached session.

## Minimum requirements

1. **Authentication** – The route must require a logged-in user and support both cookie- and token-based authentication (Bearer token). When using the token flow, clients have to pass an `Authorization: Bearer <token>` header on every request; omitting the header or using a different format causes the request to fail before the upload handler runs.
2. **Image handling** – Save the uploaded file to the WordPress Media Library. Store the attachment ID (or resulting URL) in user meta so the avatar appears in `avatar_urls` when requesting the user profile.
3. **Response body** – Return a JSON object containing the updated user information, e.g.
   ```json
   {
     "id": 123,
     "email": "member@example.com",
     "name": "Member Example",
     "first_name": "Member",
     "last_name": "Example",
     "avatar_urls": {
       "48": "https://example.com/avatar-48x48.jpg",
       "96": "https://example.com/avatar-96x96.jpg"
     }
   }
   ```
4. **Error handling** – Reply with meaningful error codes (`400`, `401`, `415`, etc.) and messages so the app can surface problems to the user.

## Suggested implementation

- Register a custom REST route in a plugin (e.g. **TCN Platform**) that hooks into `rest_api_init`.
- Use `wp_handle_upload` to process the uploaded image and `wp_update_user` or `update_user_meta` to attach the media item as the user's avatar (plugins such as Simple Local Avatars or WP User Avatar can help manage this meta).
- Return the updated user data by reusing the callback that powers `/wp-json/wp/v2/users/me` to guarantee the response format matches what the app expects.
- Ensure the route respects WordPress capability checks (e.g. `current_user_can( 'upload_files' )`).

With this endpoint in place the mobile app will automatically update WordPress whenever a member changes their photo.

## WordPress plugin requirements

The REST endpoints described above live in the TCN Platform plugin. After pulling the
mobile changes you should verify the following behaviours in the plugin code base:

1. **Route registration** – Ensure both `POST /wp-json/gn/v1/profile/avatar` and
   `DELETE /wp-json/gn/v1/profile/avatar` are registered during `rest_api_init`.
   The delete handler must clear any user meta that stores the custom avatar ID and
   return the refreshed profile payload. When no avatar is associated with the member,
   the response should mirror the default WordPress avatar URLs so the client falls
   back to initials.
2. **Shared response helper** – Reuse the same helper that powers the existing
   `/wp-json/gn/v1/me` (or core `/wp/v2/users/me`) endpoint when responding to both
   routes. This keeps the JSON shape identical to what the mobile app expects after a
   change or deletion.
3. **Capability checks** – Confirm the routes are protected by appropriate
   capability checks (e.g. `current_user_can( 'upload_files' )`) and that they honour
   the token authenticator used elsewhere in the plugin.

If these pieces are already present in production you do not need additional plugin
work. Otherwise, ship the updates above so avatar uploads and removals stay in sync
between WordPress and the mobile app.

## Client integration notes

- Fetch the bearer token from the `POST /wp-json/gn/v1/login` response when establishing a session without cookies, store it client-side, and attach it to avatar uploads while it remains valid. Password Login API tokens last seven days by default, so refresh them when you receive a `401`/`403` response or when the expiry timestamp approaches.【F:docs/wordpress/TCN_PLATFORM_REFERENCE.md†L30-L47】
- Construct the React Native `fetch`/`axios` request with an `Authorization` header of exactly `Bearer ${token}` to satisfy the plugin's `TokenAuthenticator` regex.
- Hydrate the profile card from the `avatar_urls` field returned by `/wp-json/gn/v1/me`. When the API omits this map the client falls back to showing the member's initials.
- Implement a companion `DELETE /wp-json/gn/v1/profile/avatar` handler that clears the stored avatar metadata and returns the refreshed profile payload so the app can revert to WordPress' default avatar when members remove their photo.

## Troubleshooting checklist

When uploads fail, walk through the following checks before debugging the mobile client:

1. **Bearer token present** – Call `POST /wp-json/gn/v1/login` first and copy the `api_token` from the response. Every avatar upload must set `Authorization: Bearer {api_token}` (or include `token={api_token}` as a query parameter). Requests without a recognised token fail the permission callback with `401 tcn_rest_unauthorized` before the upload handler executes.【F:docs/wordpress/TCN_PLATFORM_REFERENCE.md†L292-L304】
2. **Accepted field names** – The handler accepts either a multipart form field called `avatar` or a JSON payload containing `avatar_url`, `avatar_base64`, `avatar_mime`, and `avatar_filename`. Different field names (e.g. `profileImage`) are ignored and trigger a `tcn_avatar_missing` validation error.【F:docs/wordpress/TCN_PLATFORM_REFERENCE.md†L294-L304】
3. **HTTPS or “Allow Dev HTTP”** – By default the plugin rejects non-HTTPS requests. Enable the “Allow HTTP on WP_DEBUG sites” toggle in **TCN Platform → Password Login API** when testing on a development host, or make sure your WordPress install is served over HTTPS in production.【F:docs/wordpress/TCN_PLATFORM_REFERENCE.md†L26-L34】
4. **CORS origin** – If the mobile app runs from a different domain, add that origin to the “Allowed CORS origin” field in the Password Login API settings so preflight checks succeed and the request reaches WordPress.【F:docs/wordpress/TCN_PLATFORM_REFERENCE.md†L26-L34】
5. **User capability** – Members without `upload_files` can still update their own avatar, but only when the `user_id` in the request matches the authenticated account. Mismatched IDs cause a `403 tcn_rest_forbidden` response.【F:docs/wordpress/TCN_PLATFORM_REFERENCE.md†L292-L304】

Validating these server-side requirements usually resolves avatar upload problems without any mobile changes.
