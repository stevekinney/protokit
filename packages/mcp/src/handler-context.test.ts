import { describe, expect, it } from 'bun:test';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import {
	readProgressToken,
	readSessionIdentifier,
	readNotificationSender,
	readRequestSender,
	stringifyUnknown,
	parseSampledText,
	assertSamplingSupport,
} from './handler-context';

describe('readProgressToken', () => {
	it('returns undefined for undefined', () => {
		expect(readProgressToken(undefined)).toBeUndefined();
	});

	it('returns undefined for null', () => {
		expect(readProgressToken(null)).toBeUndefined();
	});

	it('returns undefined for a non-object', () => {
		expect(readProgressToken('string')).toBeUndefined();
	});

	it('returns the progressToken from _meta', () => {
		expect(readProgressToken({ _meta: { progressToken: 'tok-1' } })).toBe('tok-1');
	});

	it('returns a numeric progressToken', () => {
		expect(readProgressToken({ _meta: { progressToken: 42 } })).toBe(42);
	});
});

describe('readSessionIdentifier', () => {
	it('returns undefined for undefined', () => {
		expect(readSessionIdentifier(undefined)).toBeUndefined();
	});

	it('returns the sessionId when present', () => {
		expect(readSessionIdentifier({ sessionId: 'sess-abc' })).toBe('sess-abc');
	});
});

describe('readNotificationSender', () => {
	it('returns undefined when extra is undefined', () => {
		expect(readNotificationSender(undefined)).toBeUndefined();
	});

	it('returns undefined when sendNotification is not a function', () => {
		expect(readNotificationSender({ sendNotification: 'not-a-function' })).toBeUndefined();
	});

	it('returns the function when sendNotification is a function', () => {
		const sender = async () => {};
		expect(readNotificationSender({ sendNotification: sender })).toBe(sender);
	});
});

describe('readRequestSender', () => {
	it('returns undefined when extra is undefined', () => {
		expect(readRequestSender(undefined)).toBeUndefined();
	});

	it('returns undefined when sendRequest is not a function', () => {
		expect(readRequestSender({ sendRequest: 123 })).toBeUndefined();
	});

	it('returns the function when sendRequest is a function', () => {
		const sender = async () => ({});
		expect(readRequestSender({ sendRequest: sender })).toBe(sender);
	});
});

describe('stringifyUnknown', () => {
	it('returns a string as-is', () => {
		expect(stringifyUnknown('hello')).toBe('hello');
	});

	it('JSON-stringifies an object', () => {
		expect(stringifyUnknown({ key: 'value' })).toBe('{"key":"value"}');
	});

	it('falls back to String() for circular references', () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(stringifyUnknown(circular)).toBe('[object Object]');
	});
});

describe('parseSampledText', () => {
	it('extracts text from array content', () => {
		const result = { content: [{ text: 'sampled text', type: 'text' }] };
		expect(parseSampledText(result)).toBe('sampled text');
	});

	it('extracts text from single object content', () => {
		const result = { content: { text: 'direct text' } };
		expect(parseSampledText(result)).toBe('direct text');
	});

	it('falls back to stringifyUnknown for unrecognized shapes', () => {
		const result = { unexpected: 'data' };
		expect(parseSampledText(result)).toBe('{"unexpected":"data"}');
	});
});

describe('assertSamplingSupport', () => {
	it('does not throw when sendRequest is present', () => {
		expect(() => assertSamplingSupport({ sendRequest: async () => ({}) })).not.toThrow();
	});

	it('throws McpError when sendRequest is absent', () => {
		expect(() => assertSamplingSupport({})).toThrow(McpError);
		try {
			assertSamplingSupport({});
		} catch (error) {
			expect(error).toBeInstanceOf(McpError);
			expect((error as McpError).code).toBe(ErrorCode.InvalidRequest);
		}
	});
});
