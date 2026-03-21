import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

export function readProgressToken(extra: unknown): string | number | undefined {
	if (!extra || typeof extra !== 'object') return undefined;
	const meta = (extra as { _meta?: { progressToken?: string | number } })._meta;
	return meta?.progressToken;
}

export function readSessionIdentifier(extra: unknown): string | undefined {
	if (!extra || typeof extra !== 'object') return undefined;
	return (extra as { sessionId?: string }).sessionId;
}

export function readNotificationSender(
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

export function readRequestSender(
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

export function stringifyUnknown(value: unknown): string {
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function parseSampledText(result: unknown): string {
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

export function assertSamplingSupport(extra: unknown): void {
	const requestSender = readRequestSender(extra);
	if (!requestSender) {
		throw new McpError(ErrorCode.InvalidRequest, 'Client does not support sampling');
	}
}
