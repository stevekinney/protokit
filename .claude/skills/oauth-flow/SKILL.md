# Skill: OAuth Flow

Reference for the OAuth 2.1 + PKCE flow used by Claude's custom MCP connector.

## Flow

1. **Discovery**: Client fetches `GET /.well-known/oauth-authorization-server` for metadata
2. **Registration**: Client calls `POST /register` with `client_name` and `redirect_uris` (RFC 7591)
3. **Authorization**: Client redirects user to `GET /authorize?client_id=...&redirect_uri=...&response_type=code&code_challenge=...&code_challenge_method=S256&state=...`
4. **User Approval**: User sees consent screen, clicks Approve (requires Neon Auth session)
5. **Code Redirect**: Server redirects back to `redirect_uri?code=...&state=...`
6. **Token Exchange**: Client calls `POST /token` with `grant_type=authorization_code&code=...&redirect_uri=...&client_id=...&code_verifier=...`
7. **PKCE Validation**: Server verifies `SHA256(code_verifier) === stored_code_challenge` (base64url)
8. **Token Issued**: Long-lived access token, no refresh token

## Critical Details

- Claude sends `application/x-www-form-urlencoded` to `/token` — parse FormData
- Some clients may send JSON — check `Content-Type` and handle both
- PKCE is mandatory: `createHash('sha256').update(code_verifier).digest('base64url')`
- Metadata URLs must exactly match actual endpoints — Claude fails silently otherwise
- Token revocation = delete or set `revoked_at` on the `oauth_tokens` row

## Token Strategy

- Long-lived access tokens (configurable via `MCP_TOKEN_TTL_SECONDS`, default 3600s)
- No refresh token rotation
- Revoke by setting `revoked_at` timestamp on the token row
