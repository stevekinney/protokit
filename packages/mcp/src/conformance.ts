import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createMcpServer } from './server.js';
import { hasValidLocalhostRebindingHeaders } from './localhost-request-validation.js';
import type { McpRegistry, McpScopeVocabulary } from './scope-vocabulary.js';
import type { McpUserProfile } from './types/primitives.js';

export type McpConformanceEra = 'modern' | 'legacy';

export type McpConformanceResult = {
	readonly era: McpConformanceEra;
	readonly name: string;
	readonly status: 'passed' | 'failed';
	readonly error?: string;
};

export type ConsumerConformanceOptions<Scope extends string> = {
	readonly registry: McpRegistry<Scope>;
	readonly scopeVocabulary: McpScopeVocabulary<Scope>;
	readonly enableConformanceMode?: boolean;
};

export type RunMcpConformanceOptions<Scope extends string> = ConsumerConformanceOptions<Scope> & {
	readonly era: McpConformanceEra;
	/** Valid arguments for the consumer tools the harness should invoke. */
	readonly toolProbes?: Readonly<Record<string, Record<string, unknown>>>;
	/** Registry resource URIs the harness should read. */
	readonly resourceProbes?: readonly string[];
	/** Valid arguments for the consumer prompts the harness should get. */
	readonly promptProbes?: Readonly<Record<string, Record<string, string>>>;
};

function conformanceUser(userId: string): McpUserProfile {
	return {
		id: userId,
		email: 'conformance@localhost',
		name: 'Conformance User',
		image: null,
		role: 'user',
	};
}

/**
 * Creates the same stateless MCP boundary used by the standalone conformance
 * server, but against a consumer-owned registry and scope vocabulary.
 * Localhost DNS-rebinding validation is intentionally outside every mode
 * branch so enabling or disabling conformance fixtures cannot disable it.
 */
export function createConsumerConformanceHandler<Scope extends string>(
	options: ConsumerConformanceOptions<Scope>,
): { fetch(request: Request): Promise<Response> } {
	const handler = createMcpHandler(
		(requestContext) => {
			const userId = randomUUID();
			return createMcpServer(
				{
					userId,
					user: conformanceUser(userId),
					enableUiExtension: false,
					enableConformanceMode: options.enableConformanceMode ?? false,
					era: requestContext.era,
					scopes: options.scopeVocabulary.scopes,
				},
				options.registry,
			);
		},
		{ legacy: 'stateless' },
	);

	return {
		async fetch(request) {
			if (new URL(request.url).pathname !== '/mcp') {
				return new Response('Not found', { status: 404 });
			}
			if (!hasValidLocalhostRebindingHeaders(request.headers)) {
				return new Response('Forbidden', { status: 403 });
			}
			return handler.fetch(request);
		},
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function recordBehavior(
	era: McpConformanceEra,
	name: string,
	behavior: () => Promise<void>,
): Promise<McpConformanceResult> {
	try {
		await behavior();
		return { era, name, status: 'passed' };
	} catch (error) {
		return { era, name, status: 'failed', error: errorMessage(error) };
	}
}

/**
 * Exercises one protocol era and returns independently actionable results.
 * A failed behavior never prevents later behaviors from running.
 */
export async function runMcpConformance<Scope extends string>(
	options: RunMcpConformanceOptions<Scope>,
): Promise<readonly McpConformanceResult[]> {
	const handler = createConsumerConformanceHandler(options);
	const client = new Client(
		{ name: 'consumer-conformance-client', version: '1.0.0' },
		options.era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : undefined,
	);
	const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
		fetch: (input, init) => {
			const request = new Request(input, init);
			request.headers.set('host', 'localhost');
			return handler.fetch(request);
		},
	});
	const results: McpConformanceResult[] = [];
	let connected = false;

	results.push(
		await recordBehavior(options.era, 'connection', async () => {
			await client.connect(transport);
			connected = true;
			if (client.getProtocolEra() !== options.era) {
				throw new Error(
					`Expected ${options.era} protocol era, received ${String(client.getProtocolEra())}.`,
				);
			}
		}),
	);

	if (!connected) return results;

	try {
		if (options.registry.tools.length > 0) {
			results.push(
				await recordBehavior(options.era, 'tools/list', async () => {
					const listed = await client.listTools();
					const expectedNames = options.registry.tools.map((tool) => tool.name).sort();
					const actualNames = listed.tools.map((tool) => tool.name).sort();
					if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
						throw new Error(
							`Expected tools ${JSON.stringify(expectedNames)}, received ${JSON.stringify(actualNames)}.`,
						);
					}
				}),
			);
		}

		for (const [toolName, arguments_] of Object.entries(options.toolProbes ?? {}).sort(
			([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
		)) {
			results.push(
				await recordBehavior(options.era, `tools/call:${toolName}`, async () => {
					const result = await client.callTool({ name: toolName, arguments: arguments_ });
					if (result.isError) throw new Error(`Tool ${toolName} returned an error result.`);
				}),
			);
		}

		if (options.registry.resources.length > 0) {
			results.push(
				await recordBehavior(options.era, 'resources/list', async () => {
					const listed = await client.listResources();
					const expectedUris = options.registry.resources.map((resource) => resource.uri).sort();
					const actualUris = listed.resources.map((resource) => resource.uri).sort();
					if (JSON.stringify(actualUris) !== JSON.stringify(expectedUris)) {
						throw new Error(
							`Expected resources ${JSON.stringify(expectedUris)}, received ${JSON.stringify(actualUris)}.`,
						);
					}
				}),
			);
		}

		for (const uri of [...(options.resourceProbes ?? [])].sort()) {
			results.push(
				await recordBehavior(options.era, `resources/read:${uri}`, async () => {
					await client.readResource({ uri });
				}),
			);
		}

		if (options.registry.prompts.length > 0) {
			results.push(
				await recordBehavior(options.era, 'prompts/list', async () => {
					const listed = await client.listPrompts();
					const expectedNames = options.registry.prompts.map((prompt) => prompt.name).sort();
					const actualNames = listed.prompts.map((prompt) => prompt.name).sort();
					if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
						throw new Error(
							`Expected prompts ${JSON.stringify(expectedNames)}, received ${JSON.stringify(actualNames)}.`,
						);
					}
				}),
			);
		}

		for (const [promptName, arguments_] of Object.entries(options.promptProbes ?? {}).sort(
			([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
		)) {
			results.push(
				await recordBehavior(options.era, `prompts/get:${promptName}`, async () => {
					await client.getPrompt({ name: promptName, arguments: arguments_ });
				}),
			);
		}
	} finally {
		await client.close();
	}

	return results;
}
