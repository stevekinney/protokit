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
