import { metricsCollector } from '@template/mcp/metrics';
import { jsonResponse } from '@web/lib/http-response';
import { environment } from '@web/env';
import {
	checkBearerCredential,
	isPlaintextTransport,
} from '@web/lib/bearer-credential-authentication';
import { createRateLimitedResponse } from '@web/lib/rate-limit-response';
import type { RequestContext } from '@web/lib/request-context';
import { enforceMetricsRateLimit } from '@web/lib/request-rate-limiter';

/**
 * OPS-002 / S-15: `GET /metrics` — gated by `METRICS_API_KEY`, compared in
 * constant time (`checkBearerCredential`, using `constant-time-equals.ts`)
 * rather than the ordinary `!==` this route previously used. Every response
 * shape (not-found, unauthorized, rate-limited, success) carries
 * `Cache-Control: no-store` so no shared or CDN cache ever stores a
 * metrics snapshot or reveals the endpoint's mere existence by caching a
 * 404. Unavailable over plaintext transport in production (see
 * `isPlaintextTransport`'s doc comment for why trusting
 * `X-Forwarded-Proto` here is safe).
 */
export async function handleMetricsGet(context: RequestContext): Promise<Response> {
	if (
		isPlaintextTransport({
			request: context.request,
			isProduction: environment.NODE_ENV === 'production',
		})
	) {
		return jsonResponse(
			{ error: 'plaintext_transport_not_allowed', error_description: 'HTTPS is required' },
			{ status: 400, headers: { 'Cache-Control': 'no-store' } },
		);
	}

	const rateLimitResult = await enforceMetricsRateLimit({
		networkIdentity: context.networkIdentity,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds, {
			'Cache-Control': 'no-store',
		});
	}

	const credentialResult = checkBearerCredential({
		configuredKey: environment.METRICS_API_KEY,
		authorizationHeader: context.request.headers.get('authorization'),
	});

	if (credentialResult === 'not_configured') {
		return jsonResponse(
			{ error: 'not_found' },
			{ status: 404, headers: { 'Cache-Control': 'no-store' } },
		);
	}

	if (credentialResult === 'unauthorized') {
		return jsonResponse(
			{ error: 'unauthorized' },
			{ status: 401, headers: { 'Cache-Control': 'no-store' } },
		);
	}

	return jsonResponse(metricsCollector.snapshot(), {
		headers: { 'Cache-Control': 'no-store' },
	});
}
