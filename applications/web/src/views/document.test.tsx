import { describe, expect, it } from 'bun:test';
import {
	escapeHtmlInJson,
	renderStaticDocument,
	renderStreamingDocument,
} from '@web/views/document';

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

describe('renderStreamingDocument', () => {
	it('returns a ReadableStream', async () => {
		const stream = await renderStreamingDocument({
			title: 'Test Page',
			children: <p>Hello</p>,
		});
		expect(stream instanceof ReadableStream).toBe(true);
	});

	it('contains application-root hydration root', async () => {
		const stream = await renderStreamingDocument({
			title: 'Test Page',
			children: <p>Hello</p>,
		});
		const html = await streamToString(stream);
		expect(html).toContain('id="application-root"');
	});

	it('contains script tag for client bundle', async () => {
		const stream = await renderStreamingDocument({
			title: 'Test Page',
			children: <p>Hello</p>,
		});
		const html = await streamToString(stream);
		expect(html).toContain('/assets/client.js');
	});

	it('contains __SERVER_DATA__ script with serialized JSON when props provided', async () => {
		const stream = await renderStreamingDocument({
			title: 'Test Page',
			serverData: { page: 'home', user: null },
			children: <p>Hello</p>,
		});
		const html = await streamToString(stream);
		expect(html).toContain('__SERVER_DATA__');
		expect(html).toContain('"page":"home"');
	});

	it('escapes </script> sequences in serialized JSON', () => {
		const result = escapeHtmlInJson('{"html":"</script><script>alert(1)</script>"}');
		expect(result.includes('</script>')).toBe(false);
		expect(result).toContain('<\\/script>');
	});

	it('omits server data script when no serverData provided', async () => {
		const stream = await renderStreamingDocument({
			title: 'Test Page',
			children: <p>Hello</p>,
		});
		const html = await streamToString(stream);
		expect(html.includes('__SERVER_DATA__')).toBe(false);
	});
});

describe('renderStaticDocument', () => {
	it('returns a string starting with doctype', () => {
		const html = renderStaticDocument({
			title: 'Test',
			children: <p>Hello</p>,
		});
		expect(html.startsWith('<!doctype html>')).toBe(true);
	});

	it('does not include application-root or script tags', () => {
		const html = renderStaticDocument({
			title: 'Test',
			children: <p>Hello</p>,
		});
		expect(html.includes('application-root')).toBe(false);
		expect(html.includes('/assets/client.js')).toBe(false);
	});
});
