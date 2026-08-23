import { describe, expect, it } from 'bun:test';
import {
	InvalidRequestEncodingError,
	PayloadTooLargeError,
	boundRequestBody,
	readBoundedBytes,
	readBoundedFormUrlEncoded,
	readBoundedJson,
	readBoundedText,
} from '@web/lib/bounded-request-body';

/** Builds a `Request` whose body streams in fixed-size chunks with no `Content-Length` header, simulating chunked transfer encoding. */
function chunkedRequest(url: string, chunks: string[]): Request {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});
	return new Request(url, { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
}

/** The project's `bun:test` shim has no `.rejects` matcher; this mirrors the try/catch convention used elsewhere in this application's tests (see `client/page-registry.test.ts`). */
async function expectRejectsWith(
	promise: Promise<unknown>,
	ErrorClass: new (...args: never[]) => Error,
): Promise<void> {
	let thrown: unknown;
	try {
		await promise;
	} catch (error) {
		thrown = error;
	}
	expect(thrown instanceof ErrorClass).toBe(true);
}

describe('readBoundedBytes', () => {
	it('reads a body under the limit', async () => {
		const request = new Request('http://localhost/x', { method: 'POST', body: 'hello' });
		const bytes = await readBoundedBytes(request, 1024);
		expect(new TextDecoder().decode(bytes)).toBe('hello');
	});

	it('rejects a declared Content-Length over the limit without reading the body', async () => {
		const request = new Request('http://localhost/x', {
			method: 'POST',
			headers: { 'content-length': '9999' },
			body: 'x'.repeat(10),
		});
		await expectRejectsWith(readBoundedBytes(request, 100), PayloadTooLargeError);
	});

	it('rejects a non-numeric Content-Length header', async () => {
		const request = new Request('http://localhost/x', {
			method: 'POST',
			headers: { 'content-length': '1e3' },
			body: 'short',
		});
		await expectRejectsWith(readBoundedBytes(request, 10_000), PayloadTooLargeError);
	});

	it('rejects a hex-disguised Content-Length header', async () => {
		const request = new Request('http://localhost/x', {
			method: 'POST',
			headers: { 'content-length': '0x10' },
			body: 'short',
		});
		await expectRejectsWith(readBoundedBytes(request, 10_000), PayloadTooLargeError);
	});

	it('caps a chunked body (no Content-Length) once the actual byte count crosses the limit', async () => {
		const request = chunkedRequest('http://localhost/x', ['aaaaa', 'bbbbb', 'ccccc', 'ddddd']);
		await expectRejectsWith(readBoundedBytes(request, 12), PayloadTooLargeError);
	});

	it('accepts a chunked body that stays under the limit', async () => {
		const request = chunkedRequest('http://localhost/x', ['aaaaa', 'bbbbb']);
		const bytes = await readBoundedBytes(request, 100);
		expect(bytes.byteLength).toBe(10);
	});

	it('rejects a body whose declared Content-Length understates the actual size (a dishonest header)', async () => {
		const encoder = new TextEncoder();
		const actualBody = 'x'.repeat(1000);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(actualBody));
				controller.close();
			},
		});
		const request = new Request('http://localhost/x', {
			method: 'POST',
			headers: { 'content-length': '5' }, // lies: actual body is 1000 bytes
			body: stream,
			duplex: 'half',
		} as RequestInit);
		await expectRejectsWith(readBoundedBytes(request, 500), PayloadTooLargeError);
	});

	it('returns an empty buffer for a bodyless request', async () => {
		const request = new Request('http://localhost/x', { method: 'GET' });
		const bytes = await readBoundedBytes(request, 100);
		expect(bytes.byteLength).toBe(0);
	});
});

describe('readBoundedText', () => {
	it('rejects invalid UTF-8', async () => {
		const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0xfd]);
		const request = new Request('http://localhost/x', {
			method: 'POST',
			body: invalidUtf8,
		});
		await expectRejectsWith(readBoundedText(request, 100), InvalidRequestEncodingError);
	});
});

describe('readBoundedJson', () => {
	it('parses valid JSON under the limit', async () => {
		const request = new Request('http://localhost/x', {
			method: 'POST',
			body: JSON.stringify({ a: 1 }),
		});
		expect(await readBoundedJson(request, 1024)).toEqual({ a: 1 });
	});

	it('rejects malformed JSON', async () => {
		const request = new Request('http://localhost/x', { method: 'POST', body: 'not-json{{' });
		await expectRejectsWith(readBoundedJson(request, 1024), InvalidRequestEncodingError);
	});

	it('rejects a JSON body over the limit before parsing', async () => {
		const request = chunkedRequest(
			'http://localhost/x',
			Array.from({ length: 20 }, () => '{"a":"' + 'x'.repeat(100) + '"}'),
		);
		await expectRejectsWith(readBoundedJson(request, 50), PayloadTooLargeError);
	});
});

describe('readBoundedFormUrlEncoded', () => {
	it('parses form-urlencoded bodies', async () => {
		const request = new Request('http://localhost/x', {
			method: 'POST',
			body: 'a=1&b=2',
		});
		const params = await readBoundedFormUrlEncoded(request, 1024);
		expect(params.get('a')).toBe('1');
		expect(params.get('b')).toBe('2');
	});

	it('exposes duplicate keys via getAll for the caller to reject', async () => {
		const request = new Request('http://localhost/x', {
			method: 'POST',
			body: 'a=1&a=2',
		});
		const params = await readBoundedFormUrlEncoded(request, 1024);
		expect(params.getAll('a')).toEqual(['1', '2']);
	});
});

describe('boundRequestBody', () => {
	it('returns a Request whose body is bounded when actually consumed', async () => {
		const request = chunkedRequest('http://localhost/x', ['aaaaa', 'bbbbb', 'ccccc']);
		const bounded = boundRequestBody(request, 8);
		await expectRejectsWith(bounded.text(), PayloadTooLargeError);
	});

	it('preserves method and headers on the wrapped Request', async () => {
		const request = new Request('http://localhost/x', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-custom': 'value' },
			body: '{}',
		});
		const bounded = boundRequestBody(request, 1024);
		expect(bounded.method).toBe('POST');
		expect(bounded.headers.get('content-type')).toBe('application/json');
		expect(bounded.headers.get('x-custom')).toBe('value');
		expect(await bounded.text()).toBe('{}');
	});

	it('throws synchronously (before any read) on a declared oversized Content-Length', () => {
		const request = new Request('http://localhost/x', {
			method: 'POST',
			headers: { 'content-length': '99999' },
			body: 'short',
		});
		expect(() => boundRequestBody(request, 10)).toThrow(PayloadTooLargeError);
	});

	it('passes through a request with no body unchanged', () => {
		const request = new Request('http://localhost/x', { method: 'GET' });
		const bounded = boundRequestBody(request, 10);
		expect(bounded).toBe(request);
	});
});
