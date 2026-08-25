import { describe, expect, it } from 'bun:test';
import {
	escapeHtml,
	escapeHtmlInJson,
	renderDocumentHead,
	renderDocumentTail,
	renderStaticDocument,
} from '@web/views/document';

const metadata = { title: 'Test Page' };

describe('renderDocumentHead', () => {
	it('starts with the doctype and opens the body', () => {
		const html = renderDocumentHead({ metadata, stylesheetPath: '/assets/application.css' });
		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).toContain('<body>');
	});

	it('links the stylesheet it was given', () => {
		const html = renderDocumentHead({ metadata, stylesheetPath: '/assets/application-abc.css' });
		expect(html).toContain('<link rel="stylesheet" href="/assets/application-abc.css" />');
	});

	it('opens the hydration root only when a client bundle is coming', () => {
		const withBundle = renderDocumentHead({
			metadata,
			stylesheetPath: '/assets/application.css',
			includeClientBundle: true,
		});
		const withoutBundle = renderDocumentHead({
			metadata,
			stylesheetPath: '/assets/application.css',
		});
		expect(withBundle).toContain('<div id="application-root">');
		expect(withoutBundle.includes('application-root')).toBe(false);
	});
});

describe('renderDocumentTail', () => {
	it('emits the server data payload and the client bundle when hydrating', () => {
		const html = renderDocumentTail({
			clientBundlePath: '/assets/client.js',
			includeClientBundle: true,
			serverData: { page: 'home', user: null },
		});
		expect(html).toContain('__SERVER_DATA__');
		expect(html).toContain('"page":"home"');
		expect(html).toContain('/assets/client.js');
		expect(html).toContain('</body></html>');
	});

	it('omits the server data script when there is no server data', () => {
		const html = renderDocumentTail({ clientBundlePath: '/assets/client.js' });
		expect(html.includes('__SERVER_DATA__')).toBe(false);
		expect(html.includes('/assets/client.js')).toBe(false);
	});
});

describe('renderStaticDocument', () => {
	it('returns a whole document with no hydration root and no scripts', () => {
		const html = renderStaticDocument({ metadata: { title: 'Test' }, body: '<p>Hello</p>' });
		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).toContain('<p>Hello</p>');
		expect(html.includes('application-root')).toBe(false);
		expect(html.includes('<script')).toBe(false);
	});
});

/**
 * The document shell is built from template literals rather than by a
 * component framework, so nothing escapes interpolated values on its own.
 * These tests are what stands between page metadata and markup injection.
 */
describe('escapeHtml', () => {
	it('escapes the characters that can break out of text or an attribute', () => {
		expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
		expect(escapeHtml('a "quoted" value')).toBe('a &quot;quoted&quot; value');
		expect(escapeHtml("it's")).toBe('it&#39;s');
		expect(escapeHtml('a & b')).toBe('a &amp; b');
	});

	it('escapes the ampersand first, so an escape is never double-decoded', () => {
		expect(escapeHtml('&lt;')).toBe('&amp;lt;');
	});

	it('keeps injected metadata inside its attribute', () => {
		const html = renderStaticDocument({
			metadata: { title: 'Test', description: '" onload="alert(1)' },
			body: '',
		});
		expect(html).toContain('content="&quot; onload=&quot;alert(1)"');
		expect(html.includes('onload="alert(1)"')).toBe(false);
	});

	it('escapes a hostile page title rather than emitting a tag', () => {
		const html = renderStaticDocument({
			metadata: { title: '</title><script>alert(1)</script>' },
			body: '',
		});
		expect(html.includes('<script>')).toBe(false);
		expect(html).toContain('&lt;/title&gt;');
	});
});

describe('metadata rendering', () => {
	it('renders meta description when provided', () => {
		const html = renderStaticDocument({
			metadata: { title: 'Test', description: 'A test page' },
			body: '',
		});
		expect(html).toContain('<meta name="description" content="A test page" />');
	});

	it('renders canonical URL when provided', () => {
		const html = renderStaticDocument({
			metadata: { title: 'Test', canonicalUrl: 'https://example.com/page' },
			body: '',
		});
		expect(html).toContain('<link rel="canonical" href="https://example.com/page" />');
	});

	it('renders Open Graph tags when provided', () => {
		const html = renderStaticDocument({
			metadata: {
				title: 'Test',
				openGraph: {
					title: 'OG Title',
					description: 'OG Description',
					image: 'https://example.com/image.png',
					url: 'https://example.com',
					type: 'website',
				},
			},
			body: '',
		});
		expect(html).toContain('<meta property="og:title" content="OG Title" />');
		expect(html).toContain('<meta property="og:description" content="OG Description" />');
		expect(html).toContain('<meta property="og:image" content="https://example.com/image.png" />');
		expect(html).toContain('<meta property="og:url" content="https://example.com" />');
		expect(html).toContain('<meta property="og:type" content="website" />');
	});

	it('omits metadata tags when not provided', () => {
		const html = renderStaticDocument({ metadata: { title: 'Test' }, body: '' });
		expect(html.includes('name="description"')).toBe(false);
		expect(html.includes('rel="canonical"')).toBe(false);
		expect(html.includes('property="og:')).toBe(false);
	});
});

describe('escapeHtmlInJson', () => {
	it('leaves no tag-opening character in the embedded payload', () => {
		const result = escapeHtmlInJson('{"html":"</script><script>alert(1)</script>"}');
		expect(result.includes('<')).toBe(false);
		expect(result.includes('>')).toBe(false);
		expect(result).toContain('\\u003c/script\\u003e');
	});

	// A review finding (P2) claimed `escapeHtmlInJson` only matches lowercase
	// `</script` and is therefore bypassable with a mixed-case terminator
	// such as `</ScRiPt>` (HTML raw-text end-tag matching is
	// case-insensitive). It never looked at "script" at all -- it escaped
	// `</` regardless of what followed -- and now escapes every `<` outright,
	// so case cannot matter. Kept as a regression test against the exact
	// payload that finding described.
	it('escapes mixed-case terminators, not just lowercase </script>', () => {
		const result = escapeHtmlInJson(
			'{"name":"</ScRiPt><script>alert(1)</SCRIPT><ScRiPt>alert(2)</script>"}',
		);
		expect(result).not.toMatch(/<\/[a-zA-Z]/);
		expect(result.includes('<')).toBe(false);
	});

	/**
	 * A second review finding (P2), and the reason `</` alone was not enough:
	 * `<!--<script>` drives the tokenizer into script-data-double-escaped
	 * state, where the element's own `</script>` stops terminating it and the
	 * client bundle tag that follows is swallowed as script text. The value is
	 * reachable through an OAuth client's registered display name, which is
	 * serialized here as a connection's `clientName`.
	 */
	it('neutralizes a payload that would open script-data-double-escaped state', () => {
		const result = escapeHtmlInJson(JSON.stringify({ clientName: '<!--<script>' }));
		expect(result.includes('<!--')).toBe(false);
		expect(result.includes('<script')).toBe(false);
		expect(result).toBe('{"clientName":"\\u003c!--\\u003cscript\\u003e"}');
	});

	it('round-trips the original value through JSON.parse', () => {
		const payload = { clientName: '<!--<script>', note: 'a > b && c < d' };
		expect(JSON.parse(escapeHtmlInJson(JSON.stringify(payload)))).toEqual(payload);
	});

	it('is applied to the server data the document actually emits', () => {
		const html = renderDocumentTail({
			clientBundlePath: '/assets/client.js',
			includeClientBundle: true,
			serverData: { clientName: '<!--<script>' },
		});
		// Exactly one `</script>` closes the payload, and one more the bundle
		// tag -- nothing from the payload can add or disable either.
		expect(html.split('</script>').length - 1).toBe(2);
		expect(html).toContain('\\u003c!--\\u003cscript\\u003e');
	});
});
