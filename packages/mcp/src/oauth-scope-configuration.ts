import type { OAuthScopeConfiguration } from './oauth/index.js';

/** Binds an OAuth supported-scope subset to its vocabulary. */
export function defineOAuthScopeConfiguration<Scope extends string>(
	configuration: OAuthScopeConfiguration<Scope>,
): OAuthScopeConfiguration<Scope> {
	for (const scope of configuration.supportedScopes) {
		if (!configuration.vocabulary.isScope(scope)) {
			throw new Error(`Unsupported OAuth scope ${JSON.stringify(scope)}.`);
		}
	}
	return Object.freeze({
		vocabulary: configuration.vocabulary,
		supportedScopes: Object.freeze([...configuration.supportedScopes]),
	});
}
