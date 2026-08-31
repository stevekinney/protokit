#!/usr/bin/env node

import { createServer } from 'node:http';
import {
	ClientMetadataDocumentFetchError,
	safeFetchPublicHttpsUrl,
	type DnsLookupAllFunction,
} from './dist/oauth/client-metadata-documents.js';

type Proof = { name: string; run: () => Promise<void> };

function require(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function expectFetchError(action: () => Promise<unknown>, reason: string): Promise<void> {
	try {
		await action();
	} catch (error) {
		require(error instanceof ClientMetadataDocumentFetchError, 'wrong error type');
		require(error.reason === reason, `expected ${reason}, received ${error.reason}`);
		return;
	}
	throw new Error(`expected ${reason}, but the operation succeeded`);
}

const publicLookup: DnsLookupAllFunction = async () => [{ address: '93.184.216.34', family: 4 }];

const proofs: Proof[] = [
	{
		name: 'HTTPS-only mutation proof',
		run: async () => {
			let lookupCount = 0;
			let fetchCount = 0;
			await expectFetchError(
				() =>
					safeFetchPublicHttpsUrl('http://public.example/client.json', {
						lookupImpl: async (...arguments_) => {
							lookupCount += 1;
							return publicLookup(...arguments_);
						},
						fetchImpl: async () => {
							fetchCount += 1;
							return new Response();
						},
					}),
				'https_required',
			);
			require(lookupCount === 0 && fetchCount === 0, 'HTTP input crossed the boundary');
		},
	},
	{
		name: 'literal-address mutation proof',
		run: async () => {
			let lookupCount = 0;
			let fetchCount = 0;
			await expectFetchError(
				() =>
					safeFetchPublicHttpsUrl('https://127.0.0.1/client.json', {
						lookupImpl: async (...arguments_) => {
							lookupCount += 1;
							return publicLookup(...arguments_);
						},
						fetchImpl: async () => {
							fetchCount += 1;
							return new Response();
						},
					}),
				'blocked_address',
			);
			require(lookupCount === 0 && fetchCount === 0, 'private literal crossed the boundary');
		},
	},
	{
		name: 'all-resolved-addresses mutation proof',
		run: async () => {
			let fetchCount = 0;
			await expectFetchError(
				() =>
					safeFetchPublicHttpsUrl('https://public.example/client.json', {
						lookupImpl: async () => [
							{ address: '93.184.216.34', family: 4 },
							{ address: '10.0.0.1', family: 4 },
						],
						fetchImpl: async () => {
							fetchCount += 1;
							return new Response();
						},
					}),
				'blocked_address',
			);
			require(fetchCount === 0, 'a private DNS result crossed the boundary');
		},
	},
	{
		name: 'redirect-error mutation proof',
		run: async () => {
			let observedRedirect: RequestRedirect | undefined;
			await safeFetchPublicHttpsUrl('https://public.example/client.json', {
				lookupImpl: publicLookup,
				fetchImpl: async (_input, init) => {
					observedRedirect = init?.redirect;
					return new Response();
				},
			});
			require(observedRedirect === 'error', 'safe fetch did not disable redirects');
		},
	},
	{
		name: 'runtime redirect-to-private refusal',
		run: async () => {
			let privateTargetHits = 0;
			const server = createServer((request, response) => {
				if (request.url === '/private') {
					privateTargetHits += 1;
					response.end('private');
					return;
				}
				response.writeHead(302, { location: '/private' });
				response.end();
			});
			await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
			try {
				const address = server.address();
				require(address !== null && typeof address !== 'string', 'server has no TCP address');
				let redirectRejected = false;
				try {
					await fetch(`http://127.0.0.1:${address.port}/redirect`, { redirect: 'error' });
				} catch {
					redirectRejected = true;
				}
				require(redirectRejected, 'runtime accepted a redirect despite redirect: error');
				require(privateTargetHits === 0, 'runtime followed the redirect to the private target');
			} finally {
				await new Promise<void>((resolve, reject) =>
					server.close((error) => (error ? reject(error) : resolve())),
				);
			}
		},
	},
];

let failureCount = 0;
for (const proof of proofs) {
	try {
		await proof.run();
		console.log(`PASS: ${proof.name}`);
	} catch (error) {
		failureCount += 1;
		console.error(`FAIL: ${proof.name}`);
		console.error(error);
	}
}

if (failureCount > 0) process.exit(1);
console.log(
	`Client metadata SSRF runtime proofs passed on ${process.release.name} ${process.version}.`,
);
