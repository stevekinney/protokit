import type { AuthInfo } from '@modelcontextprotocol/server';
import { getBaseUrl } from '@web/lib/base-url';

/**
 * The canonical public resource URL for this MCP server, per RFC 8707. Every
 * OAuth authorization/token request that names a `resource`, every audience
 * check on an access token, and the MCP transport itself must all agree on
 * this exact string — define it once here rather than re-deriving
 * `${baseUrl}/mcp` at each call site.
 */
export function getMcpResourceUrl(request: Request): string {
	return `${getBaseUrl(request)}/mcp`;
}

/**
 * Request-scoped identity and authorization data carried on
 * `AuthInfo.extra` from the HTTP boundary (where the bearer token is
 * verified) through to the MCP SDK's per-request server factory.
 *
 * This is the shared request context later roadmap items build on:
 * - `SEC-003`/`SEC-004` extend `networkIdentity` with a trustworthy,
 *   non-spoofable value once the caller-identification boundary is hardened.
 * - `OAUTH-001` is expected to make `resource` and `scopes` enforced rather
 *   than descriptive — the fields already exist here so that item only has
 *   to add checks, not plumbing.
 * - `AUTHZ-001` reads `scopes` to gate individual tool/resource/prompt
 *   operations.
 */
export type McpRequestAuthExtra = {
	/** The authenticated application user's ID (`users.id`). */
	userId: string;
	/** The OAuth client ID the access token was issued to. */
	oauthClientId: string;
	/** Space-delimited OAuth scope string, split on whitespace. */
	scopes: string[];
	/** The canonical resource URL the token was validated against. */
	resource: string;
	/** Best-effort caller network identity for logging/observability. */
	networkIdentity?: string;
	/**
	 * OBS-001: the same `requestId` `application.ts` generated for this
	 * HTTP request, carried through to the MCP server factory so tool,
	 * resource, and prompt handlers can log under it — see `McpContext`.
	 */
	requestId?: string;
};

export function buildMcpAuthInfo(input: {
	accessToken: string;
	expiresAt: Date;
	extra: McpRequestAuthExtra;
}): AuthInfo {
	return {
		token: input.accessToken,
		clientId: input.extra.oauthClientId,
		scopes: input.extra.scopes,
		expiresAt: Math.floor(input.expiresAt.getTime() / 1000),
		resource: new URL(input.extra.resource),
		extra: input.extra,
	};
}

export function readMcpRequestAuthExtra(
	authInfo: AuthInfo | undefined,
): McpRequestAuthExtra | undefined {
	const extra = authInfo?.extra;
	if (!extra || typeof extra !== 'object') return undefined;
	const candidate = extra as Partial<McpRequestAuthExtra>;
	if (typeof candidate.userId !== 'string') return undefined;
	return candidate as McpRequestAuthExtra;
}
