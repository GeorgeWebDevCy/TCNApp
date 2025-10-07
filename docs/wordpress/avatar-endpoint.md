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

## Client integration notes

- Fetch the bearer token from the `POST /wp-json/gn/v1/login` response when establishing a session without cookies, store it client-side, and attach it to avatar uploads while it remains valid (tokens expire after roughly 15 minutes, so refresh it as needed).
- Construct the React Native `fetch`/`axios` request with an `Authorization` header of exactly `Bearer ${token}` to satisfy the plugin's `TokenAuthenticator` regex.
- Hydrate the profile card from the `avatar_urls` field returned by `/wp-json/gn/v1/me`. When the API omits this map the client falls back to showing the member's initials.
- Implement a companion `DELETE /wp-json/gn/v1/profile/avatar` handler that clears the stored avatar metadata and returns the refreshed profile payload so the app can revert to WordPress' default avatar when members remove their photo.
