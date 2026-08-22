/**
 * Central byte and field-length limits for every public body-consuming
 * route (S-05) and for the OAuth string/array fields that were previously
 * unbounded (S-05's "stored metadata" half). One file so an auditor can see
 * every limit at a glance instead of hunting through each route.
 *
 * Byte limits bound the request *body*; field limits bound individual
 * *values* once parsed, before they are hashed, stored, or compared.
 */

// -- Request body byte limits -----------------------------------------------
//
// OAuth client metadata, tokens, and codes are all short strings; these
// limits are generous relative to real payloads while still ruling out
// multi-megabyte abuse bodies.

/** `POST /oauth/register` — dynamic client registration metadata (JSON). */
export const oauthRegisterMaxBodyBytes = 16 * 1024;

/** `POST /oauth/token` — form-urlencoded or JSON grant request. */
export const oauthTokenMaxBodyBytes = 8 * 1024;

/** `POST /oauth/revoke` — form-urlencoded or JSON revocation request. */
export const oauthRevokeMaxBodyBytes = 4 * 1024;

/** `POST /oauth/authorize/approve` — form-urlencoded consent approval. */
export const oauthAuthorizeApproveMaxBodyBytes = 4 * 1024;

/** `POST /oauth/authorize/deny` — form-urlencoded consent denial. */
export const oauthAuthorizeDenyMaxBodyBytes = 4 * 1024;

/**
 * `/mcp` — JSON-RPC request bodies. Tool inputs are the largest legitimate
 * payload this server accepts, so this limit is far larger than the OAuth
 * limits above, but still bounded rather than unlimited.
 */
export const mcpRequestMaxBodyBytes = 1 * 1024 * 1024;

/** `POST /auth/sign-out` (SEC-005) — form-urlencoded CSRF token only. */
export const signOutMaxBodyBytes = 1 * 1024;

/** `POST /account/connections/revoke` and `/account/connections/revoke-all` (DATA-001) — form-urlencoded CSRF token plus, for the per-client route, a client identifier. */
export const accountConnectionsMaxBodyBytes = 1 * 1024;

// -- OAuth field-length limits ------------------------------------------------

export const oauthMaxClientNameLength = 200;
export const oauthMaxRedirectUriCount = 10;
export const oauthMaxRedirectUriLength = 2048;
export const oauthMaxGrantTypeCount = 5;
export const oauthMaxResponseTypeCount = 5;
export const oauthMaxStateLength = 512;
export const oauthMaxAuthorizationCodeLength = 512;
export const oauthMaxTokenLength = 512;

/**
 * `scope` (AUTHZ-001): a space-delimited list drawn from this server's own
 * small, fixed scope vocabulary (`@template/mcp`'s `mcpScopes`) — generous
 * relative to the longest real value (every scope requested, space-joined)
 * while still ruling out an attacker-supplied multi-kilobyte string.
 */
export const oauthMaxScopeLength = 512;

/**
 * `client_id` (OAUTH-002): a DCR client ID is a `randomUUID()` (36
 * characters), but a Client ID Metadata Document client ID is the full
 * HTTPS URL the document lives at -- same shape and bound as a redirect
 * URI, since it is one. Both must fit in one limit checked before any
 * database lookup or network fetch.
 */
export const oauthMaxClientIdLength = oauthMaxRedirectUriLength;

/**
 * `resource` (RFC 8707): same shape as a redirect URI, since it is also a
 * full HTTPS URL — the canonical `${BASE_URL}/mcp` string.
 */
export const oauthMaxResourceLength = 2048;

/**
 * `POST /oauth/authorize/approve` and `/oauth/authorize/deny` (SEC-005):
 * the form carries only an opaque transaction identifier and a one-time
 * CSRF value, both `randomBytes(32).toString('hex')` (64 hex characters).
 */
export const oauthTransactionIdLength = 64;
export const oauthCsrfTokenLength = 64;

/**
 * `POST /auth/sign-out` (SEC-005): `deriveSessionCsrfToken` returns a
 * SHA-256 HMAC hex digest (64 hex characters).
 */
export const sessionCsrfTokenMaxLength = 64;

/** RFC 7636 §4.1: `code_verifier` is 43-128 characters of the unreserved set. */
export const pkceMinCodeVerifierLength = 43;
export const pkceMaxCodeVerifierLength = 128;

/** Fixed length of a base64url-encoded, unpadded SHA-256 digest (S256 `code_challenge`). */
export const pkceCodeChallengeLength = 43;

/** Bearer tokens are 96 hex characters (`randomBytes(48).toString('hex')`); cap generously above that. */
export const mcpMaxBearerTokenLength = 512;

// -- Per-user MCP handler cache (PROTO-002) ---------------------------------
//
// `mcp-handler.ts` keeps one `McpHttpHandler` (and one `subscriptions/listen`
// event bus) per authenticated user, so a resource-update push can never
// reach another user's stream (S-11). These bound that cache so it cannot
// grow or stay open without limit.

/** Reject a new `subscriptions/listen` stream once one user already has this many open. Small on purpose — one browser tab realistically needs one. */
export const mcpMaxSubscriptionsPerUserHandler = 8;

/** How long a user's handler may sit with no open listen stream and no in-flight request before the idle sweep evicts it. */
export const mcpUserHandlerIdleMs = 5 * 60 * 1000;

/** How often the idle sweep runs. */
export const mcpUserHandlerSweepIntervalMs = 60 * 1000;

// -- Client ID Metadata Document (CIMD) fetch limits (OAUTH-002) -----------
//
// The authorization server fetches these documents from a URL the *client*
// controls, not one this server's operator configured -- every limit here
// exists to bound how much damage a hostile or broken document can do.

/** Abort the fetch if the client's metadata endpoint has not responded in time. */
export const cimdFetchTimeoutMs = 5000;

/** Same shape as `oauthRegisterMaxBodyBytes` -- a metadata document is the same JSON shape as a registration request. */
export const cimdMaxResponseBytes = 16 * 1024;

/**
 * How long a successfully fetched and validated document is trusted before
 * this server fetches it again. Bounds both fetch volume against the
 * client's endpoint and how quickly this server observes a client rotating
 * its `redirect_uris`.
 */
export const cimdCacheTtlMs = 10 * 60 * 1000;

/** Caps the in-memory cache so an attacker cycling through many distinct `client_id` URLs cannot grow it without bound. */
export const cimdCacheMaxEntries = 1000;

// -- Upstream Google identity flow (FEDAUTH-001) ----------------------------
//
// Google's token, userinfo, and JWKS endpoints are fixed, operator-chosen
// HTTPS URLs (not attacker input), but every response is still bounded: a
// slow, oversized, or wrong-content-type upstream reply must fail closed
// rather than hang the request or buffer without limit.

/** Abort the authorization-code token exchange if Google has not responded in time. */
export const googleTokenFetchTimeoutMs = 5000;

/** Abort the userinfo fetch if Google has not responded in time. */
export const googleUserInfoFetchTimeoutMs = 5000;

/** Abort the JWKS (signing key) fetch if Google has not responded in time. */
export const googleJwksFetchTimeoutMs = 5000;

/** Google's token response is a small JSON object; bound it generously above real payloads. */
export const googleTokenMaxResponseBytes = 16 * 1024;

/** Same shape as the token response. */
export const googleUserInfoMaxResponseBytes = 16 * 1024;

/** Google's JWKS document holds a handful of RSA keys; bound it well above the real size. */
export const googleJwksMaxResponseBytes = 64 * 1024;

/** How long a fetched JWKS is trusted before this server fetches it again. */
export const googleJwksCacheTtlMs = 60 * 60 * 1000;

/** RFC 7519 `exp`/`iat`/`nbf` clock-skew allowance when validating a Google ID token. */
export const googleIdTokenClockToleranceSeconds = 30;

/**
 * How many pending `google_oauth_state_*` cookies (one per concurrent
 * sign-in attempt/tab) this server keeps at once. Starting a new attempt
 * beyond this cap evicts the oldest instead of growing the `Cookie` header
 * without bound.
 */
export const googleOauthStateCookieMaxCount = 5;
