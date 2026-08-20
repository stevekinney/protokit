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

// -- OAuth field-length limits ------------------------------------------------

export const oauthMaxClientNameLength = 200;
export const oauthMaxRedirectUriCount = 10;
export const oauthMaxRedirectUriLength = 2048;
export const oauthMaxGrantTypeCount = 5;
export const oauthMaxResponseTypeCount = 5;
export const oauthMaxStateLength = 512;
export const oauthMaxAuthorizationCodeLength = 512;
export const oauthMaxTokenLength = 512;
export const oauthMaxClientIdLength = 128;

/** RFC 7636 §4.1: `code_verifier` is 43-128 characters of the unreserved set. */
export const pkceMinCodeVerifierLength = 43;
export const pkceMaxCodeVerifierLength = 128;

/** Fixed length of a base64url-encoded, unpadded SHA-256 digest (S256 `code_challenge`). */
export const pkceCodeChallengeLength = 43;

/** Bearer tokens are 96 hex characters (`randomBytes(48).toString('hex')`); cap generously above that. */
export const mcpMaxBearerTokenLength = 512;
