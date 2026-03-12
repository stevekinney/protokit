import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import {
	CreateMessageResultSchema,
	ElicitResultSchema,
	ErrorCode,
	McpError,
	SubscribeRequestSchema,
	UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const oneByOnePngBase64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5m0QAAAABJRU5ErkJggg==';

const minimalWavBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}

function readProgressToken(extra: unknown): string | number | undefined {
	if (!extra || typeof extra !== 'object') return undefined;
	const meta = (extra as { _meta?: { progressToken?: string | number } })._meta;
	return meta?.progressToken;
}

function readSessionIdentifier(extra: unknown): string | undefined {
	if (!extra || typeof extra !== 'object') return undefined;
	return (extra as { sessionId?: string }).sessionId;
}

function readNotificationSender(
	extra: unknown,
):
	| ((notification: { method: string; params: Record<string, unknown> }) => Promise<void>)
	| undefined {
	if (!extra || typeof extra !== 'object') return undefined;
	const sendNotification = (extra as { sendNotification?: unknown }).sendNotification;
	if (typeof sendNotification !== 'function') return undefined;
	return sendNotification as (notification: {
		method: string;
		params: Record<string, unknown>;
	}) => Promise<void>;
}

function readRequestSender(
	extra: unknown,
):
	| ((
			request: { method: string; params: Record<string, unknown> },
			resultSchema: unknown,
	  ) => Promise<unknown>)
	| undefined {
	if (!extra || typeof extra !== 'object') return undefined;
	const sendRequest = (extra as { sendRequest?: unknown }).sendRequest;
	if (typeof sendRequest !== 'function') return undefined;
	return sendRequest as (
		request: { method: string; params: Record<string, unknown> },
		resultSchema: unknown,
	) => Promise<unknown>;
}

function stringifyUnknown(value: unknown): string {
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function parseSampledText(result: unknown): string {
	const content = (result as { content?: unknown }).content;
	if (Array.isArray(content) && content.length > 0) {
		const first = content[0] as { text?: unknown };
		if (typeof first?.text === 'string') {
			return first.text;
		}
	}
	if (content && typeof content === 'object') {
		const text = (content as { text?: unknown }).text;
		if (typeof text === 'string') {
			return text;
		}
	}
	return stringifyUnknown(result);
}

export function registerConformanceFixtures(server: McpServer): void {
	const resourceSubscriptions = new Map<string, Set<string>>();

	server.server.registerCapabilities({
		resources: {
			subscribe: true,
			listChanged: true,
		},
	});

	server.server.setRequestHandler(SubscribeRequestSchema, async (request, extra) => {
		const sessionIdentifier = extra.sessionId ?? 'stateless';
		const subscriptionsForSession =
			resourceSubscriptions.get(sessionIdentifier) ?? new Set<string>();
		subscriptionsForSession.add(request.params.uri);
		resourceSubscriptions.set(sessionIdentifier, subscriptionsForSession);
		return {};
	});

	server.server.setRequestHandler(UnsubscribeRequestSchema, async (request, extra) => {
		const sessionIdentifier = extra.sessionId ?? 'stateless';
		const subscriptionsForSession =
			resourceSubscriptions.get(sessionIdentifier) ?? new Set<string>();
		subscriptionsForSession.delete(request.params.uri);
		resourceSubscriptions.set(sessionIdentifier, subscriptionsForSession);
		return {};
	});

	server.registerTool(
		'test_image_content',
		{ description: 'Conformance fixture: returns an image content block.' },
		async () => ({
			content: [
				{
					type: 'image' as const,
					data: oneByOnePngBase64,
					mimeType: 'image/png',
				},
			],
		}),
	);

	server.registerTool(
		'test_audio_content',
		{ description: 'Conformance fixture: returns an audio content block.' },
		async () => ({
			content: [
				{
					type: 'audio' as const,
					data: minimalWavBase64,
					mimeType: 'audio/wav',
				},
			],
		}),
	);

	server.registerTool(
		'test_embedded_resource',
		{ description: 'Conformance fixture: returns embedded resource content.' },
		async () => ({
			content: [
				{
					type: 'resource' as const,
					resource: {
						uri: 'test://embedded-resource',
						mimeType: 'text/plain',
						text: 'This is an embedded resource content.',
					},
				},
			],
		}),
	);

	server.registerTool(
		'test_multiple_content_types',
		{ description: 'Conformance fixture: returns text, image, and resource content.' },
		async () => ({
			content: [
				{
					type: 'text' as const,
					text: 'Multiple content types test:',
				},
				{
					type: 'image' as const,
					data: oneByOnePngBase64,
					mimeType: 'image/png',
				},
				{
					type: 'resource' as const,
					resource: {
						uri: 'test://mixed-content-resource',
						mimeType: 'application/json',
						text: '{"test":"data","value":123}',
					},
				},
			],
		}),
	);

	server.registerTool(
		'test_tool_with_logging',
		{
			description: 'Conformance fixture: sends logging notifications during execution.',
			inputSchema: z.object({}),
		},
		async (_input, extra) => {
			const sendNotification = readNotificationSender(extra);
			if (sendNotification) {
				await sendNotification({
					method: 'notifications/message',
					params: { level: 'info', data: 'Tool execution started' },
				});
			}
			await delay(50);
			if (sendNotification) {
				await sendNotification({
					method: 'notifications/message',
					params: { level: 'info', data: 'Tool processing data' },
				});
			}
			await delay(50);
			if (sendNotification) {
				await sendNotification({
					method: 'notifications/message',
					params: { level: 'info', data: 'Tool execution completed' },
				});
			}
			return {
				content: [
					{
						type: 'text' as const,
						text: 'Logging tool execution completed.',
					},
				],
			};
		},
	);

	server.registerTool(
		'test_tool_with_progress',
		{
			description: 'Conformance fixture: sends progress notifications during execution.',
			inputSchema: z.object({}),
		},
		async (_input, extra) => {
			const progressToken = readProgressToken(extra);
			const sendNotification = readNotificationSender(extra);
			if (progressToken !== undefined && sendNotification) {
				await sendNotification({
					method: 'notifications/progress',
					params: { progressToken, progress: 0, total: 100 },
				});
				await delay(50);
				await sendNotification({
					method: 'notifications/progress',
					params: { progressToken, progress: 50, total: 100 },
				});
				await delay(50);
				await sendNotification({
					method: 'notifications/progress',
					params: { progressToken, progress: 100, total: 100 },
				});
			} else {
				await delay(100);
			}
			return {
				content: [
					{
						type: 'text' as const,
						text: 'Progress tool execution completed.',
					},
				],
			};
		},
	);

	server.registerTool(
		'test_sampling',
		{
			description: 'Conformance fixture: requests client sampling.',
			inputSchema: {
				prompt: z.string().describe('Prompt to send to sampling/createMessage'),
			},
		},
		async (input, extra) => {
			const sendRequest = readRequestSender(extra);
			if (!sendRequest) {
				return {
					content: [
						{
							type: 'text' as const,
							text: 'Sampling is not supported by this client.',
						},
					],
					isError: true,
				};
			}

			try {
				const sampledResult = await sendRequest(
					{
						method: 'sampling/createMessage',
						params: {
							messages: [
								{
									role: 'user',
									content: {
										type: 'text',
										text: input.prompt,
									},
								},
							],
							maxTokens: 100,
						},
					},
					CreateMessageResultSchema,
				);
				return {
					content: [
						{
							type: 'text' as const,
							text: `LLM response: ${parseSampledText(sampledResult)}`,
						},
					],
				};
			} catch {
				return {
					content: [
						{
							type: 'text' as const,
							text: 'Sampling is not supported by this client.',
						},
					],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		'test_elicitation',
		{
			description: 'Conformance fixture: requests elicitation from client.',
			inputSchema: {
				message: z.string().describe('Prompt message shown to user'),
			},
		},
		async (input, extra) => {
			const sendRequest = readRequestSender(extra);
			if (!sendRequest) {
				return {
					content: [
						{ type: 'text' as const, text: 'Elicitation is not supported by this client.' },
					],
					isError: true,
				};
			}

			try {
				const elicitationResult = (await sendRequest(
					{
						method: 'elicitation/create',
						params: {
							message: input.message,
							requestedSchema: {
								type: 'object',
								properties: {
									username: {
										type: 'string',
										description: "User's response",
									},
									email: {
										type: 'string',
										description: "User's email address",
									},
								},
								required: ['username', 'email'],
							},
						},
					},
					ElicitResultSchema,
				)) as { action: string; content?: unknown };
				return {
					content: [
						{
							type: 'text' as const,
							text: `User response: action=${elicitationResult.action}, content=${stringifyUnknown(elicitationResult.content ?? {})}`,
						},
					],
				};
			} catch {
				return {
					content: [
						{ type: 'text' as const, text: 'Elicitation is not supported by this client.' },
					],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		'test_elicitation_sep1034_defaults',
		{
			description: 'Conformance fixture: elicitation defaults for SEP-1034.',
			inputSchema: z.object({}),
		},
		async (_input, extra) => {
			const sendRequest = readRequestSender(extra);
			if (!sendRequest) {
				return {
					content: [
						{ type: 'text' as const, text: 'Elicitation is not supported by this client.' },
					],
					isError: true,
				};
			}

			try {
				const result = (await sendRequest(
					{
						method: 'elicitation/create',
						params: {
							message: 'Provide defaults confirmation',
							requestedSchema: {
								type: 'object',
								properties: {
									name: { type: 'string', default: 'John Doe' },
									age: { type: 'integer', default: 30 },
									score: { type: 'number', default: 95.5 },
									status: {
										type: 'string',
										enum: ['active', 'inactive', 'pending'],
										default: 'active',
									},
									verified: { type: 'boolean', default: true },
								},
								required: ['name', 'age', 'score', 'status', 'verified'],
							},
						},
					},
					ElicitResultSchema,
				)) as { action: string; content?: unknown };
				return {
					content: [
						{
							type: 'text' as const,
							text: `Elicitation completed: action=${result.action}, content=${stringifyUnknown(result.content ?? {})}`,
						},
					],
				};
			} catch {
				return {
					content: [
						{ type: 'text' as const, text: 'Elicitation is not supported by this client.' },
					],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		'test_elicitation_sep1330_enums',
		{
			description: 'Conformance fixture: enum variants for SEP-1330.',
			inputSchema: z.object({}),
		},
		async (_input, extra) => {
			const sendRequest = readRequestSender(extra);
			if (!sendRequest) {
				return {
					content: [
						{ type: 'text' as const, text: 'Elicitation is not supported by this client.' },
					],
					isError: true,
				};
			}

			try {
				const result = (await sendRequest(
					{
						method: 'elicitation/create',
						params: {
							message: 'Choose enum variants',
							requestedSchema: {
								type: 'object',
								properties: {
									untitledSingle: {
										type: 'string',
										enum: ['option1', 'option2', 'option3'],
									},
									titledSingle: {
										type: 'string',
										oneOf: [
											{ const: 'value1', title: 'First Option' },
											{ const: 'value2', title: 'Second Option' },
											{ const: 'value3', title: 'Third Option' },
										],
									},
									legacyEnum: {
										type: 'string',
										enum: ['opt1', 'opt2', 'opt3'],
										enumNames: ['Option One', 'Option Two', 'Option Three'],
									},
									untitledMulti: {
										type: 'array',
										items: {
											type: 'string',
											enum: ['option1', 'option2', 'option3'],
										},
									},
									titledMulti: {
										type: 'array',
										items: {
											anyOf: [
												{ const: 'value1', title: 'First Choice' },
												{ const: 'value2', title: 'Second Choice' },
												{ const: 'value3', title: 'Third Choice' },
											],
										},
									},
								},
								required: [
									'untitledSingle',
									'titledSingle',
									'legacyEnum',
									'untitledMulti',
									'titledMulti',
								],
							},
						},
					},
					ElicitResultSchema,
				)) as { action: string; content?: unknown };
				return {
					content: [
						{
							type: 'text' as const,
							text: `Elicitation completed: action=${result.action}, content=${stringifyUnknown(result.content ?? {})}`,
						},
					],
				};
			} catch {
				return {
					content: [
						{ type: 'text' as const, text: 'Elicitation is not supported by this client.' },
					],
					isError: true,
				};
			}
		},
	);

	server.registerResource(
		'test_static_text_resource',
		'test://static-text',
		{ description: 'Conformance fixture static text resource', mimeType: 'text/plain' },
		async () => ({
			contents: [
				{
					uri: 'test://static-text',
					mimeType: 'text/plain',
					text: 'This is the content of the static text resource.',
				},
			],
		}),
	);

	server.registerResource(
		'test_static_binary_resource',
		'test://static-binary',
		{ description: 'Conformance fixture static binary resource', mimeType: 'image/png' },
		async () => ({
			contents: [
				{
					uri: 'test://static-binary',
					mimeType: 'image/png',
					blob: oneByOnePngBase64,
				},
			],
		}),
	);

	server.registerResource(
		'test_template_resource',
		new ResourceTemplate('test://template/{id}/data', {
			list: async () => ({
				resources: [
					{
						uri: 'test://template/123/data',
						name: 'template-data-123',
						mimeType: 'application/json',
					},
				],
			}),
		}),
		{ description: 'Conformance fixture template resource', mimeType: 'application/json' },
		async (_uri, variables) => {
			const identifier = String(variables.id ?? '');
			return {
				contents: [
					{
						uri: `test://template/${identifier}/data`,
						mimeType: 'application/json',
						text: `{"id":"${identifier}","templateTest":true,"data":"Data for ID: ${identifier}"}`,
					},
				],
			};
		},
	);

	server.registerPrompt(
		'test_simple_prompt',
		{ description: 'Conformance fixture simple prompt.' },
		async () => ({
			messages: [
				{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: 'This is a simple prompt for testing.',
					},
				},
			],
		}),
	);

	server.registerPrompt(
		'test_prompt_with_arguments',
		{
			description: 'Conformance fixture prompt with arguments.',
			argsSchema: {
				arg1: completable(z.string().describe('First test argument'), async (value) => {
					const query = String(value ?? '').toLowerCase();
					const values = ['paris', 'park', 'party'];
					return values.filter((item) => item.startsWith(query));
				}),
				arg2: z.string().describe('Second test argument'),
			},
		},
		async (arguments_) => ({
			messages: [
				{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: `Prompt with arguments: arg1='${arguments_.arg1}', arg2='${arguments_.arg2}'`,
					},
				},
			],
		}),
	);

	server.registerPrompt(
		'test_prompt_with_embedded_resource',
		{
			description: 'Conformance fixture prompt with embedded resource.',
			argsSchema: {
				resourceUri: z.string().describe('URI of resource to embed'),
			},
		},
		async (arguments_) => ({
			messages: [
				{
					role: 'user' as const,
					content: {
						type: 'resource' as const,
						resource: {
							uri: arguments_.resourceUri,
							mimeType: 'text/plain',
							text: 'Embedded resource content for testing.',
						},
					},
				},
				{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: 'Please process the embedded resource above.',
					},
				},
			],
		}),
	);

	server.registerPrompt(
		'test_prompt_with_image',
		{
			description: 'Conformance fixture prompt with image content.',
		},
		async () => ({
			messages: [
				{
					role: 'user' as const,
					content: {
						type: 'image' as const,
						data: oneByOnePngBase64,
						mimeType: 'image/png',
					},
				},
				{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: 'Please analyze the image above.',
					},
				},
			],
		}),
	);

	server.registerTool(
		'test_watched_resource_update',
		{
			description:
				'Conformance fixture helper that emits resource update notifications for subscribed URIs.',
			inputSchema: z.object({}),
		},
		async (_input, extra) => {
			const sessionIdentifier = readSessionIdentifier(extra) ?? 'stateless';
			const subscriptionsForSession =
				resourceSubscriptions.get(sessionIdentifier) ?? new Set<string>();
			for (const uri of subscriptionsForSession) {
				await server.server.sendResourceUpdated({ uri });
			}
			return {
				content: [
					{
						type: 'text' as const,
						text: 'Sent resource updates for current subscriptions.',
					},
				],
			};
		},
	);
}

export function assertSamplingSupport(extra: unknown): void {
	const requestSender = readRequestSender(extra);
	if (!requestSender) {
		throw new McpError(ErrorCode.InvalidRequest, 'Client does not support sampling');
	}
}
