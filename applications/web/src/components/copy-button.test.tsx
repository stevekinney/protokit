import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyButton } from '@web/components/copy-button';

describe('CopyButton', () => {
	it('renders without error', () => {
		const html = renderToStaticMarkup(<CopyButton text="https://example.com/mcp" />);
		expect(html.length).toBeGreaterThan(0);
	});

	it('renders a button element', () => {
		const html = renderToStaticMarkup(<CopyButton text="https://example.com/mcp" />);
		expect(html).toContain('<button');
		expect(html).toContain('Copy');
	});

	it('accepts a text prop', () => {
		const html = renderToStaticMarkup(<CopyButton text="some-text-value" />);
		expect(html).toContain('button');
	});
});
