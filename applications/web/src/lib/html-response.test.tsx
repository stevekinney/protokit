import { describe, expect, it } from 'bun:test';
import { createStaticHtmlResponse, createStreamingHtmlResponse } from '@web/lib/html-response';

async function streamToString(stream: ReadableStream): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let result = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		result += decoder.decode(value, { stream: true });
	}

	result += decoder.decode();
	return result;
}

describe('createStaticHtmlResponse', () => {
	it('returns Response with text/html content-type', () => {
		const response = createStaticHtmlResponse({
			title: 'Test',
			body: <p>Hello</p>,
		});
		expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
	});

	it('returns 200 status by default', () => {
		const response = createStaticHtmlResponse({
			title: 'Test',
			body: <p>Hello</p>,
		});
		expect(response.status).toBe(200);
	});
});

describe('createStreamingHtmlResponse', () => {
	it('returns Response with text/html content-type', async () => {
		const response = await createStreamingHtmlResponse({
			title: 'Test',
			body: <p>Hello</p>,
		});
		expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
	});

	it('has a ReadableStream body', async () => {
		const response = await createStreamingHtmlResponse({
			title: 'Test',
			body: <p>Hello</p>,
		});
		expect(response.body instanceof ReadableStream).toBe(true);
	});

	it('produces full HTML document starting with doctype', async () => {
		const response = await createStreamingHtmlResponse({
			title: 'Test',
			body: <p>Hello</p>,
		});
		const html = await streamToString(response.body!);
		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).toContain('</html>');
	});
});
