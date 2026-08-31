import type { McpRegistry } from './scope-vocabulary.js';
import { getSvelteKitMountState, setSvelteKitMountState } from './sveltekit-mount-state.js';
import { isValidCidr } from './oauth/security-utilities.js';
import { getSupportedScopes } from './supported-scopes.js';
import {
	handleOauthAuthorizationMetadataGet,
	handleOauthAuthorizeApprove,
	handleOauthAuthorizeDeny,
	handleOauthAuthorizeGet,
	handleOauthProtectedResourceMcpMetadataGet,
	handleOauthProtectedResourceMetadataGet,
	handleOauthRegisterPost,
	handleOauthRevokePost,
	handleOauthTokenPost,
	oauthCorsHeaders,
	type OAuthDiscoveryConfiguration,
	type OAuthHostSeams,
	type OAuthIdentity,
	type OAuthRequestContext,
	type OAuthStatelessHostSeams,
} from './oauth/index.js';

export type SvelteKitLikeRequestEvent = {
	request: Request;
	url: URL;
	locals: Record<PropertyKey, unknown>;
	getClientAddress(): string;
};

export type SvelteKitMcpHandleInput = {
	event: SvelteKitLikeRequestEvent;
	resolve(event: SvelteKitLikeRequestEvent): Response | Promise<Response>;
};

export type SvelteKitMcpMount = {
	handle(input: SvelteKitMcpHandleInput): Promise<Response>;
	dispose(): Promise<void>;
};

export type SvelteKitMcpRuntime = {
	start(): Promise<void>;
	shutdown(): Promise<void>;
	publishGrantRevocation(subjectId: string): Promise<void>;
	handle(context: OAuthRequestContext): Promise<Response>;
};

const primedIdentities = new WeakMap<SvelteKitLikeRequestEvent, OAuthIdentity | null>();

const requiredOauthSeamFunctions = [
	'fetchClientIdMetadataDocument',
	'resolveIdentityBinding',
	'resolveUserProfile',
	'handleUnauthenticatedAuthorization',
	'renderConsent',
	'hashCredential',
] as const satisfies ReadonlyArray<keyof OAuthHostSeams<string>>;

type RuntimeObject = Record<string, unknown>;

function assertOauthSeamObject(value: unknown, path: string): asserts value is RuntimeObject {
	if (!value || typeof value !== 'object') {
		throw new Error(`The SvelteKit MCP mount requires the OAuth host seam "${path}".`);
	}
}

function assertOauthSeamFunctions(
	value: RuntimeObject,
	path: string,
	names: readonly string[],
): void {
	for (const name of names) {
		if (typeof value[name] !== 'function') {
			throw new Error(`The SvelteKit MCP mount requires the OAuth host seam "${path}.${name}".`);
		}
	}
}

function assertOauthSeamNumber(value: unknown, path: string, minimumExclusive: number): void {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= minimumExclusive) {
		throw new Error(`The SvelteKit MCP mount requires the OAuth host seam "${path}".`);
	}
}

function assertOauthStore(
	stores: RuntimeObject,
	name: string,
	requiredFunctions: readonly string[],
): void {
	assertOauthSeamObject(stores[name], `stores.${name}`);
	assertOauthSeamFunctions(stores[name], `stores.${name}`, requiredFunctions);
}

function assertRequiredOauthSeams<Scope extends string>(seams: OAuthHostSeams<Scope>): void {
	for (const name of requiredOauthSeamFunctions) {
		if (typeof seams[name] !== 'function') {
			throw new Error(`The SvelteKit MCP mount requires the OAuth host seam "${name}".`);
		}
	}
	if (seams.recordEvent !== undefined && typeof seams.recordEvent !== 'function') {
		throw new Error('The SvelteKit MCP mount requires the OAuth host seam "recordEvent".');
	}
	if (seams.crossInstanceMessaging !== undefined) {
		assertOauthSeamObject(seams.crossInstanceMessaging, 'crossInstanceMessaging');
		assertOauthSeamFunctions(seams.crossInstanceMessaging, 'crossInstanceMessaging', [
			'publish',
			'subscribe',
		]);
	}
	assertOauthSeamObject(seams.stores, 'stores');
	assertOauthStore(seams.stores, 'transactions', [
		'create',
		'consume',
		'unconsume',
		'deleteByBinding',
		'deleteAllForUser',
		'purgeExpired',
	]);
	assertOauthStore(seams.stores, 'codes', [
		'issue',
		'findByHash',
		'consume',
		'unconsume',
		'deleteAllForUser',
		'purgeExpired',
	]);
	assertOauthStore(seams.stores, 'tokens', [
		'issueAuthorizationGrant',
		'findByHash',
		'rotateRefreshToken',
		'revokeAccessToken',
		'revokeRefreshToken',
		'revokeFamily',
		'deleteAllForUser',
		'purgeExpired',
	]);
	assertOauthStore(seams.stores, 'clients', ['register', 'upsert', 'findById', 'update']);
	assertOauthSeamFunctions(seams.stores, 'stores', ['deleteAllForUser']);

	assertOauthSeamObject(seams.scopes, 'scopes');
	assertOauthSeamObject(seams.scopes.vocabulary, 'scopes.vocabulary');
	assertOauthSeamFunctions(seams.scopes.vocabulary, 'scopes.vocabulary', [
		'isScope',
		'defineTool',
		'defineResource',
		'definePrompt',
		'defineRegistry',
	]);
	if (!Array.isArray(seams.scopes.vocabulary.scopes)) {
		throw new Error(
			'The SvelteKit MCP mount requires the OAuth host seam "scopes.vocabulary.scopes".',
		);
	}
	assertOauthSeamObject(seams.scopes.vocabulary.descriptions, 'scopes.vocabulary.descriptions');
	if (!Array.isArray(seams.scopes.supportedScopes)) {
		throw new Error(
			'The SvelteKit MCP mount requires the OAuth host seam "scopes.supportedScopes".',
		);
	}
	for (const [index, scope] of seams.scopes.supportedScopes.entries()) {
		if (typeof scope !== 'string' || !seams.scopes.vocabulary.isScope(scope)) {
			throw new Error(
				`The SvelteKit MCP mount requires the OAuth host seam "scopes.supportedScopes[${index}]".`,
			);
		}
	}

	assertOauthSeamObject(seams.configuration, 'configuration');
	const configuration = seams.configuration as unknown as RuntimeObject;
	if (typeof configuration.issuer !== 'string' || configuration.issuer.trim().length === 0) {
		throw new Error('The SvelteKit MCP mount requires the OAuth host seam "configuration.issuer".');
	}
	for (const name of ['baseUrl', 'resource'] as const) {
		if (!(configuration[name] instanceof URL)) {
			throw new Error(
				`The SvelteKit MCP mount requires the OAuth host seam "configuration.${name}".`,
			);
		}
	}
	for (const name of [
		'accessTokenTtlSeconds',
		'refreshTokenTtlSeconds',
		'clientSecretTtlSeconds',
	] as const) {
		assertOauthSeamNumber(configuration[name], `configuration.${name}`, 0);
	}
	assertOauthSeamFunctions(configuration, 'configuration', ['isTrustedOrigin']);
	assertOauthSeamObject(configuration.trustedProxy, 'configuration.trustedProxy');
	if (!Array.isArray(configuration.trustedProxy.trustedProxyCidrs)) {
		throw new Error(
			'The SvelteKit MCP mount requires the OAuth host seam "configuration.trustedProxy.trustedProxyCidrs".',
		);
	}
	for (const [index, cidr] of configuration.trustedProxy.trustedProxyCidrs.entries()) {
		if (typeof cidr !== 'string' || !isValidCidr(cidr)) {
			throw new Error(
				`The SvelteKit MCP mount requires the OAuth host seam "configuration.trustedProxy.trustedProxyCidrs[${index}]".`,
			);
		}
	}
	if (
		configuration.trustedProxy.trustedProxyHeader !== undefined &&
		!['x-forwarded-for', 'forwarded', 'cf-connecting-ip'].includes(
			configuration.trustedProxy.trustedProxyHeader as string,
		)
	) {
		throw new Error(
			'The SvelteKit MCP mount requires the OAuth host seam "configuration.trustedProxy.trustedProxyHeader".',
		);
	}
	assertOauthSeamNumber(
		configuration.trustedProxy.trustedProxyHopCount,
		'configuration.trustedProxy.trustedProxyHopCount',
		-1,
	);
	if (!Number.isInteger(configuration.trustedProxy.trustedProxyHopCount)) {
		throw new Error(
			'The SvelteKit MCP mount requires the OAuth host seam "configuration.trustedProxy.trustedProxyHopCount".',
		);
	}
	assertOauthSeamObject(configuration.rateLimits, 'configuration.rateLimits');
	assertOauthSeamNumber(
		configuration.rateLimits.maximumConcurrent,
		'configuration.rateLimits.maximumConcurrent',
		0,
	);
	assertOauthSeamObject(configuration.rateLimits.categories, 'configuration.rateLimits.categories');
	for (const category of [
		'oauth_authorize',
		'oauth_register',
		'oauth_token_network',
		'oauth_token_client',
		'oauth_revoke',
		'mcp_network',
		'mcp_user',
		'failed_authentication',
	] as const) {
		const path = `configuration.rateLimits.categories.${category}`;
		assertOauthSeamObject(configuration.rateLimits.categories[category], path);
		assertOauthSeamNumber(
			configuration.rateLimits.categories[category].maximumRequests,
			`${path}.maximumRequests`,
			0,
		);
		assertOauthSeamNumber(
			configuration.rateLimits.categories[category].windowSeconds,
			`${path}.windowSeconds`,
			0,
		);
	}
	assertOauthSeamObject(configuration.mcpUiExtension, 'configuration.mcpUiExtension');
	if (typeof configuration.mcpUiExtension.enabled !== 'boolean') {
		throw new Error(
			'The SvelteKit MCP mount requires the OAuth host seam "configuration.mcpUiExtension.enabled".',
		);
	}
	if (configuration.rateLimitStores !== undefined) {
		assertOauthSeamObject(configuration.rateLimitStores, 'configuration.rateLimitStores');
		assertOauthSeamObject(
			configuration.rateLimitStores.slidingWindow,
			'configuration.rateLimitStores.slidingWindow',
		);
		assertOauthSeamFunctions(
			configuration.rateLimitStores.slidingWindow,
			'configuration.rateLimitStores.slidingWindow',
			['consume', 'peek'],
		);
		if (configuration.rateLimitStores.concurrencySlots !== undefined) {
			assertOauthSeamObject(
				configuration.rateLimitStores.concurrencySlots,
				'configuration.rateLimitStores.concurrencySlots',
			);
			assertOauthSeamFunctions(
				configuration.rateLimitStores.concurrencySlots,
				'configuration.rateLimitStores.concurrencySlots',
				['acquire', 'renew', 'release'],
			);
		}
	}
}

function assertMountConfigurationAgreement<Scope extends string>(input: {
	oauthSeams: OAuthHostSeams<Scope>;
	discoveryConfiguration: OAuthDiscoveryConfiguration;
	registry: McpRegistry<Scope>;
}): void {
	const expectedScopes = getSupportedScopes(input.registry);
	const configuredScopes = [...input.oauthSeams.scopes.supportedScopes].sort((left, right) =>
		left < right ? -1 : left > right ? 1 : 0,
	);
	if (
		expectedScopes.length !== configuredScopes.length ||
		expectedScopes.some((scope, index) => scope !== configuredScopes[index])
	) {
		throw new Error(
			'The SvelteKit MCP mount requires "scopes.supportedScopes" to match the mounted registry.',
		);
	}

	const oauthConfiguration = input.oauthSeams.configuration;
	const discoveryConfiguration = input.discoveryConfiguration;
	if (oauthConfiguration.baseUrl.href !== `${oauthConfiguration.baseUrl.origin}/`) {
		throw new Error(
			'The SvelteKit MCP mount requires "configuration.baseUrl" to be an origin-only URL.',
		);
	}
	if (discoveryConfiguration.issuer !== oauthConfiguration.issuer) {
		throw new Error(
			'The SvelteKit MCP mount requires "discoveryConfiguration.issuer" to match the OAuth host seams.',
		);
	}
	if (discoveryConfiguration.baseUrl.href !== oauthConfiguration.baseUrl.href) {
		throw new Error(
			'The SvelteKit MCP mount requires "discoveryConfiguration.baseUrl" to match the OAuth host seams.',
		);
	}
	if (discoveryConfiguration.resource.href !== oauthConfiguration.resource.href) {
		throw new Error(
			'The SvelteKit MCP mount requires "discoveryConfiguration.resource" to match the OAuth host seams.',
		);
	}
	if (discoveryConfiguration.mcpUiExtension.enabled !== oauthConfiguration.mcpUiExtension.enabled) {
		throw new Error(
			'The SvelteKit MCP mount requires "discoveryConfiguration.mcpUiExtension" to match the OAuth host seams.',
		);
	}
}

/**
 * Records that the host identity handle ran for this request. A null identity
 * is distinct from a handle that was skipped or sequenced after the MCP mount.
 */
export function primeSvelteKitMcpIdentity(
	event: SvelteKitLikeRequestEvent,
	identity: OAuthIdentity | null,
): void {
	primedIdentities.set(event, identity);
}

function createStatelessSeams<Scope extends string>(
	seams: OAuthHostSeams<Scope>,
	runtime: SvelteKitMcpRuntime,
): OAuthStatelessHostSeams<Scope> {
	return {
		scopes: seams.scopes,
		configuration: seams.configuration,
		crossInstanceMessaging: seams.crossInstanceMessaging,
		recordEvent: seams.recordEvent,
		stores: {
			clients: seams.stores.clients,
			codes: seams.stores.codes,
			tokens: seams.stores.tokens,
		},
		hashCredential: seams.hashCredential,
		publishGrantRevocation: (subjectId) => runtime.publishGrantRevocation(subjectId),
	};
}

function preflightResponse(): Response {
	return new Response(null, { status: 204, headers: oauthCorsHeaders });
}

/**
 * Creates one process-wide MCP/OAuth lifecycle for a SvelteKit-compatible
 * handle chain without importing SvelteKit. The host retains ownership of its
 * listener, signals, request draining, and process termination.
 */
export async function createSvelteKitMcpMount<Scope extends string>(input: {
	oauthSeams: OAuthHostSeams<Scope>;
	discoveryConfiguration: OAuthDiscoveryConfiguration;
	registry: McpRegistry<Scope>;
	identityHandleName: string;
	/** Must be true only for a process that persists across requests. */
	longLivedProcess: boolean;
	/** Supplies the host's existing request correlation identifier. */
	getRequestId?(event: SvelteKitLikeRequestEvent): string;
	mcp: SvelteKitMcpRuntime;
}): Promise<SvelteKitMcpMount> {
	const mountState = getSvelteKitMountState();
	if (mountState === 'constructing' || mountState === 'live') {
		throw new Error('The SvelteKit MCP mount has already been constructed in this process.');
	}
	if (mountState === 'disposed') {
		throw new Error(
			'The SvelteKit MCP mount cannot be constructed again after disposal or failure.',
		);
	}
	setSvelteKitMountState('constructing');
	try {
		assertRequiredOauthSeams(input.oauthSeams);
		assertMountConfigurationAgreement(input);
		if (!input.longLivedProcess) {
			throw new Error(
				'The MCP mount requires a long-lived process; request-scoped edge and serverless runtimes cannot preserve subscription state.',
			);
		}
		await input.mcp.start();
	} catch (error) {
		setSvelteKitMountState('disposed');
		try {
			await input.mcp.shutdown();
		} catch (shutdownError) {
			throw new AggregateError(
				[error, shutdownError],
				'The SvelteKit MCP mount failed to start and its cleanup also failed.',
				{ cause: shutdownError },
			);
		}
		throw error;
	}
	setSvelteKitMountState('live');
	const getStatelessSeams = () => createStatelessSeams(input.oauthSeams, input.mcp);
	let disposed = false;

	return {
		async handle({ event, resolve }) {
			if (disposed || getSvelteKitMountState() !== 'live') {
				throw new Error('The SvelteKit MCP mount is disposed.');
			}
			if (!primedIdentities.has(event)) {
				throw new Error(
					`The SvelteKit MCP mount requires the prior ${input.identityHandleName} handle to prime identity for every request. Ensure it appears earlier in sequence() and does not skip conditional requests.`,
				);
			}
			const context: OAuthRequestContext = {
				request: event.request,
				requestUrl: event.url,
				requestId: input.getRequestId?.(event) ?? crypto.randomUUID(),
				socketAddress: event.getClientAddress(),
				identity: primedIdentities.get(event) ?? null,
			};
			const method = event.request.method;
			const path = event.url.pathname;
			if (
				method === 'OPTIONS' &&
				(path.startsWith('/.well-known/') || path.startsWith('/oauth/'))
			) {
				return preflightResponse();
			}
			if (method === 'GET' && path === '/.well-known/oauth-authorization-server') {
				return handleOauthAuthorizationMetadataGet(
					context,
					input.discoveryConfiguration,
					input.registry,
				);
			}
			if (method === 'GET' && path === '/.well-known/oauth-protected-resource') {
				return handleOauthProtectedResourceMetadataGet(
					context,
					input.discoveryConfiguration,
					input.registry,
				);
			}
			if (method === 'GET' && path === '/.well-known/oauth-protected-resource/mcp') {
				return handleOauthProtectedResourceMcpMetadataGet(
					context,
					input.discoveryConfiguration,
					input.registry,
				);
			}
			if (method === 'GET' && path === '/oauth/authorize') {
				return handleOauthAuthorizeGet(context, input.oauthSeams);
			}
			if (method === 'POST' && path === '/oauth/authorize/approve') {
				return handleOauthAuthorizeApprove(context, input.oauthSeams);
			}
			if (method === 'POST' && path === '/oauth/authorize/deny') {
				return handleOauthAuthorizeDeny(context, input.oauthSeams);
			}
			if (method === 'POST' && path === '/oauth/register') {
				return handleOauthRegisterPost(context, getStatelessSeams());
			}
			if (method === 'POST' && path === '/oauth/token') {
				return handleOauthTokenPost(context, getStatelessSeams());
			}
			if (method === 'POST' && path === '/oauth/revoke') {
				return handleOauthRevokePost(context, getStatelessSeams());
			}
			if (path === '/mcp') return input.mcp.handle(context);
			return resolve(event);
		},
		async dispose() {
			if (disposed) return;
			disposed = true;
			setSvelteKitMountState('disposed');
			await input.mcp.shutdown();
		},
	};
}
