import { describe, expect, it } from 'bun:test';
import {
	__utf8ByteLengthForTests,
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

describe('the cap measures UTF-8 bytes, not UTF-16 code units', () => {
	const capBytes = 256 * 1024;

	/**
	 * The defect this covers: `String.length` counts UTF-16 code units, and a
	 * CJK character is one code unit but three UTF-8 bytes. So a payload can
	 * sit comfortably under a character cap while encoding to nearly three
	 * times the advertised byte limit — on a bound whose only job is stopping
	 * oversized payloads reaching a client.
	 *
	 * It survived the existing tests because they pad with ASCII, where
	 * characters and bytes coincide. Padding with `中` is the entire difference
	 * between a test that checks this and one that reads as if it does.
	 */
	const multiByte = '中'.repeat(200_000);

	it('the fixture is genuinely under a character cap and over a byte cap', () => {
		// Asserted rather than assumed: if this ever stopped holding, the two
		// tests below would still pass while checking nothing.
		expect(multiByte.length).toBeLessThan(capBytes);
		expect(new TextEncoder().encode(multiByte).length).toBeGreaterThan(capBytes);
	});

	it('rejects a multi-byte text result that a character cap would have allowed', () => {
		const response = createToolTextResponse(multiByte);
		expect((response as { isError?: boolean }).isError).toBe(true);
		expect(response.content[0].text).toContain('bytes');
	});

	it('rejects it through the structured path too, not only the text one', () => {
		const response = createToolStructuredResponse({ padding: multiByte }, 'summary');
		expect((response as { isError?: boolean }).isError).toBe(true);
		expect(response.content[0].text).toContain('bytes');
	});

	it('still returns an ASCII payload just under the cap intact', () => {
		// A fix that rejects what the bound exists to permit is not a fix. This
		// also exercises the slow path: 262,044 code units is well past the
		// third-of-cap fast path, so it is actually encoded and measured.
		const justUnder = 'x'.repeat(capBytes - 100);
		const response = createToolTextResponse(justUnder);
		expect((response as { isError?: boolean }).isError).toBeUndefined();
		expect(response.content[0].text).toBe(justUnder);
	});

	it('reports the real byte length in the error, not the character count', () => {
		const response = createToolTextResponse(multiByte);
		expect(response.content[0].text).toContain(String(600_000));
	});
});

describe('utf8ByteLength agrees with TextEncoder', () => {
	/**
	 * The counter is hand-rolled because `TextEncoder.encode()` allocates the
	 * whole encoded payload to measure it — up to three times the string — on
	 * exactly the oversized responses this cap exists to reject. Hand-rolling
	 * trades that allocation for the risk of disagreeing with the real encoder,
	 * which would replace one bug with another. So it is pinned against the
	 * reference rather than reasoned about.
	 */
	const reference = new TextEncoder();
	const cases: Array<[string, string]> = [
		['empty', ''],
		['ascii', 'hello world'],
		['two-byte Latin', 'café rôle Ünïcödé'],
		['two-byte Cyrillic and Greek', 'Привет κόσμε'],
		['three-byte CJK', '中文日本語한국어'],
		['four-byte emoji (surrogate pairs)', '👋🏽🎉🧑‍💻'],
		['lone high surrogate', '\uD800'],
		['lone low surrogate', '\uDC00'],
		['lone surrogate between text', `a\uD800b`],
		['mixed everything', 'a é 中 👋 \uD800 z'],
		['boundary U+007F', '\u007F'],
		['boundary U+0080', '\u0080'],
		['boundary U+07FF', '\u07FF'],
		['boundary U+0800', '\u0800'],
		['boundary U+FFFF', '\uFFFF'],
		['boundary U+10000', '\u{10000}'],
	];

	for (const [name, value] of cases) {
		it(`matches for ${name}`, () => {
			expect(__utf8ByteLengthForTests(value)).toBe(reference.encode(value).length);
		});
	}

	it('matches on a large mixed payload', () => {
		const large = ('a é 中 👋 ' + '\uD800').repeat(20_000);
		expect(__utf8ByteLengthForTests(large)).toBe(reference.encode(large).length);
	});
});
