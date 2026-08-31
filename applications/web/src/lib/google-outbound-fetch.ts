import { isExactContentType } from '@lostgradient/mcp/oauth';

/**
 * Bounded outbound fetch for Google's fixed, documented OAuth/OIDC endpoints
 * (token, userinfo, JWKS) — FEDAUTH-001 / S-16. Same shape as OAUTH-002's
 * `client-metadata-documents.ts` bounded-fetch approach (abort timeout,
 * `redirect: 'error'`, exact content-type, streamed size cap), reimplemented
 * here rather than imported because that file is owned by another agent
 * this wave.
 *
 * Unlike a Client ID Metadata Document URL, these endpoint URLs are hardcoded
 * constants this server's operator chose, not attacker-controlled input, so
 * there is no DNS/SSRF check here — only bounding a slow, oversized,
 * redirected, or wrong-content-type/wrong-host response so a compromised or
 * misbehaving upstream cannot hang a request or smuggle an oversized body
 * past validation.
 */

export class GoogleOutboundFetchError extends Error {
	constructor(public readonly reason: string) {
		super(reason);
		this.name = 'GoogleOutboundFetchError';
	}
}

export type GoogleOutboundFetchDependencies = {
	fetchImpl?: typeof fetch;
};

export type GoogleOutboundFetchInit = {
	method: 'GET' | 'POST';
	headers?: Record<string, string>;
	body?: BodyInit;
	timeoutMs: number;
	expectedContentType: string;
	maxResponseBytes: number;
	/** Exact hostname the URL must resolve to before this server will fetch it — defense in depth against a typo'd or reconfigured constant. */
	expectedHost: string;
};

export type GoogleOutboundFetchResult = {
	status: number;
	text: string;
};

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
	const declaredLength = response.headers.get('content-length');
	if (declaredLength !== null) {
		const declaredBytes = Number(declaredLength);
		if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
			throw new GoogleOutboundFetchError('response_too_large');
		}
	}

	if (!response.body) return '';

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let receivedBytes = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		receivedBytes += value.byteLength;
		if (receivedBytes > maxBytes) {
			await reader.cancel(new Error('response too large')).catch(() => {});
			throw new GoogleOutboundFetchError('response_too_large');
		}

		chunks.push(value);
	}

	const combined = new Uint8Array(receivedBytes);
	let offset = 0;
	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.byteLength;
	}

	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(combined);
	} catch {
		throw new GoogleOutboundFetchError('invalid_encoding');
	}
}

/**
 * Fetches `url` with a bounded deadline, an exact-host check, no redirect
 * following, an exact content-type requirement, and a streamed size cap.
 * Throws `GoogleOutboundFetchError` for every failure mode (wrong host,
 * wrong scheme, timeout, network error, redirect, wrong content type,
 * oversized body, invalid encoding) rather than returning a distinguishable
 * result — callers translate every failure into the same generic local
 * error so nothing about the upstream response is disclosed to the caller.
 */
export async function fetchGoogleEndpointBounded(
	url: string,
	init: GoogleOutboundFetchInit,
	dependencies: GoogleOutboundFetchDependencies = {},
): Promise<GoogleOutboundFetchResult> {
	const fetchImpl = dependencies.fetchImpl ?? fetch;
	const targetUrl = new URL(url);

	if (targetUrl.protocol !== 'https:') {
		throw new GoogleOutboundFetchError('unexpected_scheme');
	}

	if (targetUrl.host !== init.expectedHost) {
		throw new GoogleOutboundFetchError('unexpected_host');
	}

	let response: Response;
	try {
		response = await fetchImpl(url, {
			method: init.method,
			headers: init.headers,
			body: init.body,
			redirect: 'error',
			signal: AbortSignal.timeout(init.timeoutMs),
		});
	} catch (error) {
		if (error instanceof GoogleOutboundFetchError) throw error;
		throw new GoogleOutboundFetchError('fetch_failed');
	}

	if (!isExactContentType(response.headers.get('content-type'), init.expectedContentType)) {
		throw new GoogleOutboundFetchError('unexpected_content_type');
	}

	const text = await readBoundedResponseText(response, init.maxResponseBytes);
	return { status: response.status, text };
}
