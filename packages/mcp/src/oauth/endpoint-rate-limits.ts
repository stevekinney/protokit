import { RequestRateLimiter } from '../rate-limit/request-rate-limiter.js';
import { createRateLimitedResponse } from '../rate-limit/rate-limit-response.js';
import type {
	OAuthRateLimitCategory,
	OAuthRequestContext,
	OAuthStatelessHostSeams,
} from './index.js';
import { resolveOauthNetworkIdentity } from './network-identity.js';

function limiter<Scope extends string>(
	seams: OAuthStatelessHostSeams<Scope>,
): RequestRateLimiter | undefined {
	const store = seams.configuration.rateLimitStores?.slidingWindow;
	return store ? new RequestRateLimiter(seams.configuration.rateLimits, () => store) : undefined;
}

export function networkIdentity<Scope extends string>(
	context: OAuthRequestContext,
	seams: OAuthStatelessHostSeams<Scope>,
): string {
	return resolveOauthNetworkIdentity({
		socketAddress: context.socketAddress,
		headers: context.request.headers,
		configuration: seams.configuration.trustedProxy,
	});
}

export async function rateLimitResponse<Scope extends string>(input: {
	context: OAuthRequestContext;
	seams: OAuthStatelessHostSeams<Scope>;
	category: OAuthRateLimitCategory;
	identifier?: string;
}): Promise<Response | undefined> {
	const requestLimiter = limiter(input.seams);
	if (!requestLimiter) return undefined;
	const identity = networkIdentity(input.context, input.seams);
	const result = await requestLimiter.consume(
		input.category,
		input.identifier ? `${identity}:${input.identifier}` : identity,
	);
	if (result.allowed) return undefined;
	return createRateLimitedResponse(result.retryAfterSeconds, {
		'Access-Control-Allow-Origin': '*',
		'Cache-Control': 'no-store',
		Pragma: 'no-cache',
	});
}

export async function isAuthenticationLockedOut<Scope extends string>(
	context: OAuthRequestContext,
	seams: OAuthStatelessHostSeams<Scope>,
): Promise<boolean> {
	const requestLimiter = limiter(seams);
	if (!requestLimiter) return false;
	const count = await requestLimiter.peek('failed_authentication', networkIdentity(context, seams));
	return count >= seams.configuration.rateLimits.categories.failed_authentication.maximumRequests;
}

export async function recordFailedAuthentication<Scope extends string>(
	context: OAuthRequestContext,
	seams: OAuthStatelessHostSeams<Scope>,
): Promise<void> {
	await limiter(seams)?.consume('failed_authentication', networkIdentity(context, seams));
}
