import { describe, expect, it } from 'bun:test';
import { resolveSessionSigningSecrets } from '@web/lib/session-signing-secret';

const currentSecret = 'a'.repeat(32);
const previousSecret = 'b'.repeat(32);

describe('resolveSessionSigningSecrets', () => {
	it('uses the configured secret as current with no previous when only SESSION_SIGNING_SECRET is set', () => {
		const result = resolveSessionSigningSecrets({
			sessionSigningSecret: currentSecret,
			sessionSigningSecretPrevious: undefined,
			nodeEnvironment: 'production',
		});
		expect(result.current).toBe(currentSecret);
		expect(result.previous).toEqual([]);
	});

	it('carries SESSION_SIGNING_SECRET_PREVIOUS into the overlap set (rotation, not cutover)', () => {
		const result = resolveSessionSigningSecrets({
			sessionSigningSecret: currentSecret,
			sessionSigningSecretPrevious: previousSecret,
			nodeEnvironment: 'production',
		});
		expect(result.current).toBe(currentSecret);
		expect(result.previous).toEqual([previousSecret]);
	});

	it('drops the previous secret once SESSION_SIGNING_SECRET_PREVIOUS is unset (cutover)', () => {
		const result = resolveSessionSigningSecrets({
			sessionSigningSecret: currentSecret,
			sessionSigningSecretPrevious: undefined,
			nodeEnvironment: 'production',
		});
		expect(result.previous).toEqual([]);
	});

	it('throws in production when no current secret is configured, even if a previous one is', () => {
		expect(() =>
			resolveSessionSigningSecrets({
				sessionSigningSecret: undefined,
				sessionSigningSecretPrevious: previousSecret,
				nodeEnvironment: 'production',
			}),
		).toThrow(/SESSION_SIGNING_SECRET is required in production/);
	});

	it('falls back to a generated secret outside production, ignoring any stray previous value', () => {
		const result = resolveSessionSigningSecrets({
			sessionSigningSecret: undefined,
			sessionSigningSecretPrevious: previousSecret,
			nodeEnvironment: 'development',
			generateFallback: () => 'generated-fallback',
		});
		expect(result.current).toBe('generated-fallback');
		expect(result.previous).toEqual([]);
	});

	it('generates a fresh fallback secret in test mode too', () => {
		const result = resolveSessionSigningSecrets({
			sessionSigningSecret: undefined,
			sessionSigningSecretPrevious: undefined,
			nodeEnvironment: 'test',
			generateFallback: () => 'generated-fallback',
		});
		expect(result.current).toBe('generated-fallback');
	});
});
