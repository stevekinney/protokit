import { describe, test, expect } from 'bun:test';
import { findLeakedSecretPaths, parseContextFileListing } from './audit-docker-context.ts';

describe('findLeakedSecretPaths', () => {
	test('flags .env variants at any depth, never .env.example', () => {
		const leaks = findLeakedSecretPaths([
			'.env.local',
			'applications/web/.env.local',
			'deep/nested/dir/.env.production',
			'.env.example',
			'applications/web/.env.example',
			'README.md',
		]);

		expect(leaks).toEqual([
			'.env.local',
			'applications/web/.env.local',
			'deep/nested/dir/.env.production',
		]);
	});

	test('flags certificate and key files at any depth', () => {
		const leaks = findLeakedSecretPaths([
			'server.pem',
			'nested/tls/server.key',
			'deep/creds.p12',
			'deep/creds.pfx',
			'ca.crt',
			'not-a-secret.txt',
		]);

		expect(leaks).toEqual([
			'server.pem',
			'nested/tls/server.key',
			'deep/creds.p12',
			'deep/creds.pfx',
			'ca.crt',
		]);
	});

	test('flags .aws and .ssh directory contents at any depth', () => {
		const leaks = findLeakedSecretPaths([
			'.aws/credentials',
			'home/user/.ssh/id_rsa',
			'src/index.ts',
		]);
		expect(leaks).toEqual(['.aws/credentials', 'home/user/.ssh/id_rsa']);
	});

	test('does not flag unrelated files', () => {
		expect(findLeakedSecretPaths(['package.json', 'src/env.ts', 'docs/environment.md'])).toEqual(
			[],
		);
	});
});

describe('parseContextFileListing', () => {
	test('strips the /ctx/ prefix and blank lines', () => {
		const parsed = parseContextFileListing('/ctx/a.txt\n/ctx/sub/b.txt\n\n');
		expect(parsed).toEqual(['a.txt', 'sub/b.txt']);
	});
});
