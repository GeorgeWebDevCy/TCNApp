# WordPress Avatar Upload Endpoint

The mobile app now calls `POST /wp-json/gn/v1/profile/avatar` to upload a member's profile photo. The endpoint is expected to accept a `multipart/form-data` payload with an `avatar` field that contains the uploaded image file. A successful response must return the updated user profile in the same shape as `/wp-json/wp/v2/users/me` so the client can refresh the cached session.

## Minimum requirements

1. **Authentication** – The route must require a logged-in user and support both cookie- and token-based authentication (Bearer token).
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
