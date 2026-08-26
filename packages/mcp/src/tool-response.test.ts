import { describe, expect, it } from 'bun:test';
import {
	createToolErrorResponse,
	createToolJsonResponse,
	createToolStructuredResponse,
	createToolTextResponse,
} from './tool-response.js';

describe('createToolTextResponse', () => {
	it('returns the text unchanged when under the size limit', () => {
		const response = createToolTextResponse('hello');
		expect(response.content[0].text).toBe('hello');
		expect((response as { isError?: boolean }).isError).toBeUndefined();
	});

	it('replaces an oversized result with a stable error response rather than truncating it', () => {
		const hugeText = 'x'.repeat(300 * 1024);
		const response = createToolTextResponse(hugeText);
		expect((response as { isError?: boolean }).isError).toBe(true);
		expect(response.content[0].text).not.toBe(hugeText);
		expect(response.content[0].text).toContain('exceeded');
		// The replacement message itself must be well under the limit.
		expect(response.content[0].text.length < 1024).toBe(true);
	});
});

describe('createToolJsonResponse', () => {
	it('serializes small data unchanged', () => {
		const response = createToolJsonResponse({ id: '1', name: 'Alice' });
		expect(response.content[0].text).toBe(JSON.stringify({ id: '1', name: 'Alice' }));
		expect((response as { isError?: boolean }).isError).toBeUndefined();
	});

	it('replaces an oversized JSON result with a stable error response', () => {
		const hugeArray = Array.from({ length: 50_000 }, (_, index) => ({ index, value: 'padding' }));
		const response = createToolJsonResponse(hugeArray);
		expect((response as { isError?: boolean }).isError).toBe(true);
		expect(response.content[0].text).toContain('exceeded');
	});

	it('never throws on undefined data', () => {
		const response = createToolJsonResponse(undefined);
		expect(response.content[0].text).toBe('null');
	});
});

describe('createToolErrorResponse', () => {
	it('always marks isError true', () => {
		const response = createToolErrorResponse('something went wrong');
		expect(response.isError).toBe(true);
		expect(response.content[0].text).toBe('something went wrong');
	});

	it('bounds an oversized error message too', () => {
		const hugeMessage = 'x'.repeat(300 * 1024);
		const response = createToolErrorResponse(hugeMessage);
		expect(response.isError).toBe(true);
		expect(response.content[0].text).not.toBe(hugeMessage);
	});
});

describe('createToolStructuredResponse', () => {
	it('returns the summary as text content and the data as structuredContent when both are under the size limit', () => {
		const data = { id: '1', name: 'Alice' };
		const response = createToolStructuredResponse(data, 'Found user Alice');
		expect(response.content[0].text).toBe('Found user Alice');
		expect((response as { isError?: boolean }).isError).toBeUndefined();
		expect((response as { structuredContent?: unknown }).structuredContent).toEqual(data);
	});

	it('replaces an oversized summary with a stable error response, never reaching structuredContent', () => {
		const hugeSummary = 'x'.repeat(300 * 1024);
		const response = createToolStructuredResponse({ id: '1' }, hugeSummary);
		expect((response as { isError?: boolean }).isError).toBe(true);
		expect(response.content[0].text).not.toBe(hugeSummary);
		expect(response.content[0].text).toContain('exceeded');
		expect((response as { structuredContent?: unknown }).structuredContent).toBeUndefined();
	});

	it('replaces an oversized structured payload with a stable error response even when the summary is small', () => {
		const hugeArray = Array.from({ length: 50_000 }, (_, index) => ({ index, value: 'padding' }));
		const response = createToolStructuredResponse(hugeArray, 'a small summary');
		expect((response as { isError?: boolean }).isError).toBe(true);
		expect(response.content[0].text).toContain('exceeded');
		expect((response as { structuredContent?: unknown }).structuredContent).toBeUndefined();
	});
});
