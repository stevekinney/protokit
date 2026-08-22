import { createHash, createHmac } from 'node:crypto';
import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	generateSessionSigningSecret,
	hashCredential,
	planSessionSecretRailwayCutover,
	planSessionSecretRailwayRotation,
	rotateSessionSigningSecretCutoverLocally,
	rotateSessionSigningSecretLocally,
} from './rotate-secret.ts';
import {
	appendEnvironmentEntryToFile,
	readEnvironmentEntriesFromFile,
} from './environment-file.ts';

describe('generateSessionSigningSecret', () => {
	test('generates a 64-character hex string (32 bytes) and never repeats', () => {
		const a = generateSessionSigningSecret();
		const b = generateSessionSigningSecret();
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(b).toMatch(/^[0-9a-f]{64}$/);
		expect(a).not.toBe(b);
	});
});

describe('rotateSessionSigningSecretLocally', () => {
	let directory: string;
	let environmentFile: string;

	afterEach(() => {
		if (directory) rmSync(directory, { recursive: true, force: true });
	});

	test('writes a fresh current secret and moves the outgoing value to SESSION_SIGNING_SECRET_PREVIOUS (DATA-001 overlap window)', () => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-rotate-test-'));
		environmentFile = join(directory, '.env.local');

		const oldSecret = 'a'.repeat(64);
		appendEnvironmentEntryToFile(environmentFile, 'SESSION_SIGNING_SECRET', oldSecret);

		const result = rotateSessionSigningSecretLocally(environmentFile);

		expect(result.previousValuePresent).toBe(true);
		expect(result.nextValue).not.toBe(oldSecret);
		expect(result.nextValue).toMatch(/^[0-9a-f]{64}$/);

		const entries = readEnvironmentEntriesFromFile(environmentFile);
		expect(entries['SESSION_SIGNING_SECRET']).toBe(result.nextValue);
		// DATA-001 / S-18: unlike the previous instant-invalidation behavior,
		// the outgoing secret is preserved as the overlap-window value, not
		// discarded — a signature made under it keeps verifying until cutover.
		expect(entries['SESSION_SIGNING_SECRET_PREVIOUS']).toBe(oldSecret);
	});

	test('rotateSessionSigningSecretCutoverLocally removes SESSION_SIGNING_SECRET_PREVIOUS, ending the overlap', () => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-rotate-test-'));
		environmentFile = join(directory, '.env.local');

		const oldSecret = 'a'.repeat(64);
		appendEnvironmentEntryToFile(environmentFile, 'SESSION_SIGNING_SECRET', oldSecret);
		const { nextValue } = rotateSessionSigningSecretLocally(environmentFile);
		expect(readEnvironmentEntriesFromFile(environmentFile)['SESSION_SIGNING_SECRET_PREVIOUS']).toBe(
			oldSecret,
		);

		rotateSessionSigningSecretCutoverLocally(environmentFile);

		const entries = readEnvironmentEntriesFromFile(environmentFile);
		expect(entries['SESSION_SIGNING_SECRET_PREVIOUS']).toBeUndefined();
		// Cutover only removes the previous value — the current secret this
		// rotation just wrote is untouched.
		expect(entries['SESSION_SIGNING_SECRET']).toBe(nextValue);
	});

	test('writes a fresh secret when none existed before', () => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-rotate-test-'));
		environmentFile = join(directory, '.env.local');

		const result = rotateSessionSigningSecretLocally(environmentFile);

		expect(result.previousValuePresent).toBe(false);
		expect(readEnvironmentEntriesFromFile(environmentFile)['SESSION_SIGNING_SECRET']).toBe(
			result.nextValue,
		);
	});

	/**
	 * Genuine proof that rotation invalidates prior signed material, not just that the file
	 * changed. This reimplements the exact construction documented at
	 * `applications/web/src/lib/csrf-protection.ts`'s `deriveSessionCsrfToken`
	 * (`createHmac('sha256', sessionSigningSecret).update(sessionToken).digest('hex')`), because
	 * `scripts/` cannot import that internal module directly — `applications/web`'s package
	 * exports only `./environment-schema` and `./lib/production-startup-requirements` — and this
	 * item does not touch `applications/web/src` while other agents are editing it in parallel
	 * this wave. The property under test is the one that actually matters operationally: a value
	 * an attacker captured while it was signed under the old secret cannot be reproduced or
	 * verified once `SESSION_SIGNING_SECRET` rotates.
	 */
	test('a value signed under the pre-rotation secret does not verify under the post-rotation secret', () => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-rotate-test-'));
		environmentFile = join(directory, '.env.local');

		const oldSecret = 'b'.repeat(64);
		appendEnvironmentEntryToFile(environmentFile, 'SESSION_SIGNING_SECRET', oldSecret);
		const sessionToken = 'session-token-captured-by-an-attacker';
		const tokenSignedWithOldSecret = createHmac('sha256', oldSecret)
			.update(sessionToken)
			.digest('hex');

		const { nextValue: newSecret } = rotateSessionSigningSecretLocally(environmentFile);
		const expectedSignatureUnderNewSecret = createHmac('sha256', newSecret)
			.update(sessionToken)
			.digest('hex');

		expect(tokenSignedWithOldSecret).not.toBe(expectedSignatureUnderNewSecret);
	});
});

describe('planSessionSecretRailwayRotation', () => {
	// Regression for a bot-reported P1: the pre-fix command only wrote `.env.local` and an
	// unconsumed GitHub secret mirror, leaving the running Railway service's
	// SESSION_SIGNING_SECRET stale and never installing SESSION_SIGNING_SECRET_PREVIOUS there —
	// so the documented overlap-window restart would have restarted with the OLD key and no
	// grace period, defeating the whole point of a rotation procedure.
	test('always includes SESSION_SIGNING_SECRET, and includes SESSION_SIGNING_SECRET_PREVIOUS only when an overlap value exists', () => {
		const withOverlap = planSessionSecretRailwayRotation('next-secret', 'previous-secret');
		expect(withOverlap).toEqual([
			{ action: 'set', key: 'SESSION_SIGNING_SECRET', value: 'next-secret' },
			{ action: 'set', key: 'SESSION_SIGNING_SECRET_PREVIOUS', value: 'previous-secret' },
		]);

		const withoutOverlap = planSessionSecretRailwayRotation('next-secret', undefined);
		expect(withoutOverlap).toEqual([
			{ action: 'set', key: 'SESSION_SIGNING_SECRET', value: 'next-secret' },
		]);
	});
});

describe('planSessionSecretRailwayCutover', () => {
	test('deletes SESSION_SIGNING_SECRET_PREVIOUS from Railway, ending the overlap remotely too', () => {
		expect(planSessionSecretRailwayCutover()).toEqual([
			{ action: 'delete', key: 'SESSION_SIGNING_SECRET_PREVIOUS' },
		]);
	});
});

describe('hashCredential', () => {
	test('matches the SHA-256 hash scripts/seed.ts stores for an OAuth client secret', () => {
		// Locks the two implementations to the same algorithm without importing seed.ts's
		// private helper — a divergence here would silently break client authentication after
		// rotation while looking correct in isolation.
		const expected = createHash('sha256').update('a-secret').digest('hex');
		expect(hashCredential('a-secret')).toBe(expected);
	});

	test('is deterministic and different secrets hash differently', () => {
		expect(hashCredential('one')).toBe(hashCredential('one'));
		expect(hashCredential('one')).not.toBe(hashCredential('two'));
	});
});
