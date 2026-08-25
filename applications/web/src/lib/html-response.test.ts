import { describe, expect, it } from 'bun:test';
import { createStaticHtmlResponse, createStreamingHtmlResponse } from '@web/lib/html-response';
import HeadEmittingPage from '@web/test-fixtures/head-emitting-page.svelte';
import PlainPage from '@web/test-fixtures/plain-page.svelte';

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
			metadata: { title: 'Test' },
			component: PlainPage,
			props: {},
		});
		expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
	});

	it('returns 200 status by default', () => {
		const response = createStaticHtmlResponse({
			metadata: { title: 'Test' },
			component: PlainPage,
			props: {},
		});
		expect(response.status).toBe(200);
	});

	it('threads metadata through to rendered output', async () => {
		const response = createStaticHtmlResponse({
			metadata: { title: 'Metadata Test', description: 'Threaded description' },
			component: PlainPage,
			props: {},
		});
		const html = await response.text();
		expect(html).toContain('<title>Metadata Test</title>');
		expect(html).toContain('name="description" content="Threaded description"');
	});

	it('renders the component with the props it was given', async () => {
		const response = createStaticHtmlResponse({
			metadata: { title: 'Test' },
			component: PlainPage,
			props: { message: 'Rendered from props' },
		});
		expect(await response.text()).toContain('Rendered from props');
	});

	it('ships no client bundle', async () => {
		const response = createStaticHtmlResponse({
			metadata: { title: 'Test' },
			component: PlainPage,
			props: {},
		});
		const html = await response.text();
		expect(html.includes('<script')).toBe(false);
		expect(html.includes('application-root')).toBe(false);
	});

	/**
	 * The shell builds `<head>` from DocumentMetadata, so head content coming
	 * from a component has nowhere to go. Failing loudly here is also what
	 * catches a component compiled with a `css` mode other than `'none'`,
	 * whose styles would arrive the same way.
	 */
	it('throws rather than silently dropping component head content', () => {
		expect(() =>
			createStaticHtmlResponse({
				metadata: { title: 'Test' },
				component: HeadEmittingPage,
				props: {},
			}),
		).toThrow(/rendered <head> content/);
	});
});

describe('createStreamingHtmlResponse', () => {
	function streamingResponse(metadata: { title: string; description?: string }) {
		return createStreamingHtmlResponse({
			metadata,
			resolvePage: async () => ({
				component: PlainPage,
				serverData: { page: 'test', message: 'Hello' },
			}),
		});
	}

	it('returns Response with text/html content-type', async () => {
		const response = await streamingResponse({ title: 'Test' });
		expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
	});

	it('has a ReadableStream body', async () => {
		const response = await streamingResponse({ title: 'Test' });
		expect(response.body instanceof ReadableStream).toBe(true);
	});

	it('produces full HTML document starting with doctype', async () => {
		const response = await streamingResponse({ title: 'Test' });
		const html = await streamToString(response.body!);
		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).toContain('</html>');
	});

	it('threads metadata through to rendered output', async () => {
		const response = await streamingResponse({
			title: 'Stream Test',
			description: 'Streamed description',
		});
		const html = await streamToString(response.body!);
		expect(html).toContain('<title>Stream Test</title>');
		expect(html).toContain('name="description" content="Streamed description"');
	});

	it('uses serverData as both the render props and the hydration payload', async () => {
		const response = await streamingResponse({ title: 'Test' });
		const html = await streamToString(response.body!);
		// Rendered from the same object that is serialized for the client, which
		// is what makes a server/client prop mismatch structurally impossible.
		expect(html).toContain('<p>Hello</p>');
		expect(html).toContain('"message":"Hello"');
		expect(html).toContain('id="application-root"');
		expect(html).toContain('__SERVER_DATA__');
	});

	/**
	 * The entire point of the shell-first split: the browser should have the
	 * stylesheet link in hand while the server is still fetching page data.
	 * This is the assertion that fails if someone hoists the data work back
	 * out of `resolvePage`.
	 */
	it('flushes the document head before resolvePage settles', async () => {
		let releasePage: () => void = () => {};
		const pageGate = new Promise<void>((resolve) => {
			releasePage = resolve;
		});

		const response = await createStreamingHtmlResponse({
			metadata: { title: 'Shell First' },
			resolvePage: async () => {
				await pageGate;
				return { component: PlainPage, serverData: { page: 'test', message: 'Late' } };
			},
		});

		const reader = response.body!.getReader();
		const firstChunk = new TextDecoder().decode((await reader.read()).value);

		expect(firstChunk).toContain('<title>Shell First</title>');
		expect(firstChunk).toContain('rel="stylesheet"');
		// The body has not been rendered yet -- resolvePage is still blocked.
		expect(firstChunk.includes('Late')).toBe(false);

		releasePage();
		await reader.cancel();
	});

	it('errors the stream rather than emitting a half-rendered page', async () => {
		const response = await createStreamingHtmlResponse({
			metadata: { title: 'Test' },
			resolvePage: async () => {
				throw new Error('page data unavailable');
			},
		});

		expect(streamToString(response.body!)).rejects.toThrow('page data unavailable');
	});
});
