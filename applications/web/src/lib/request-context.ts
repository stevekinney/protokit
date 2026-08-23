import type { ApplicationUser } from '@web/lib/session-authentication';

export type RequestContext = {
	request: Request;
	requestUrl: URL;
	requestId: string;
	/** The raw socket address reported by the runtime, before any trusted-proxy resolution. */
	clientAddress?: string;
	/**
	 * The one canonical network identity for this request, resolved once by
	 * `handleApplicationRequest` via `getRequestClientIdentifier`. Every
	 * downstream consumer (rate limiting, MCP auth context, lockouts) must
	 * read this field rather than re-deriving identity from headers or the
	 * socket address itself.
	 */
	networkIdentity: string;
	user: ApplicationUser | null;
	sessionToken: string | null;
};
