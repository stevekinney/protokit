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
