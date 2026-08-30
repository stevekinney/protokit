import { describe, expect, it } from 'bun:test';
import { defineScopes } from '../scope-vocabulary.js';
import { defineOAuthScopeConfiguration } from '../oauth-scope-configuration.js';

describe('defineOAuthScopeConfiguration', () => {
	it('snapshots a supported subset from the supplied vocabulary', () => {
		const vocabulary = defineScopes({
			'repositories:read': 'Read repositories.',
			'pull-requests:read': 'Read pull requests.',
		});
		const supportedScopes = ['repositories:read'] as const;
		const configuration = defineOAuthScopeConfiguration({ vocabulary, supportedScopes });

		expect(configuration.supportedScopes).toEqual(['repositories:read']);
		expect(configuration.supportedScopes).not.toBe(supportedScopes);
		expect(Object.isFrozen(configuration.supportedScopes)).toBe(true);
	});

	it('rejects an undeclared scope from a widened or untyped caller', () => {
		const vocabulary = defineScopes({ 'repositories:read': 'Read repositories.' });
		const supportedScopes = ['misspelled:scope'] as string[];

		expect(() =>
			defineOAuthScopeConfiguration({
				vocabulary,
				supportedScopes,
			}),
		).toThrow('Unsupported OAuth scope "misspelled:scope".');
	});
});
