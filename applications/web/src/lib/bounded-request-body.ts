/**
 * Enforces a byte limit while a request body is *read*, not after it has
 * already been buffered by `Request.json()`/`formData()`. This is the fix
 * for S-05: every public body-consuming route was buffering the entire body
 * before any size check ran.
 *
 * Two entry points:
 * - `readBoundedBytes`/`readBoundedText`/`readBoundedJson`/
 *   `readBoundedFormUrlEncoded` pull directly from `request.body`'s reader
 *   with an accumulator, for routes this module owns end to end (every
 *   OAuth route).
 * - `boundRequestBody` wraps the body in a counting `ReadableStream` and
 *   returns a *new* `Request`, for the one caller that needs to hand a
 *   `Request` object to code this module does not control (the MCP SDK
 *   handler). It is built from `request.url`/`method`/`headers` rather than
 *   from `request` itself, because constructing `new Request(request, ...)`
 *   after the original body has been read (even by `getReader()`) throws
 *   "body already used" per the Fetch spec.
 *
 * Both paths reject a declared `Content-Length` that already exceeds the
 * limit before a single byte is read, and both cap actual bytes received
 * regardless of what `Content-Length` claimed (or its absence, as with
 * chunked transfer encoding) — so a missing or dishonest header cannot
 * bypass the cap in either direction.
 */

export class PayloadTooLargeError extends Error {
	constructor(
		message: string,
		public readonly maxBytes: number,
	) {
		super(message);
		this.name = 'PayloadTooLargeError';
	}
}

export class InvalidRequestEncodingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidRequestEncodingError';
	}
}

/** Strict HTTP-grammar integer check. Rejects `1e3`, `0x10`, leading `+`/`-`, and whitespace that `Number()` would silently accept. */
const strictNonNegativeIntegerPattern = /^\d+$/;

function assertDeclaredContentLengthWithinLimit(request: Request, maxBytes: number): void {
	const contentLengthHeader = request.headers.get('content-length');
	if (contentLengthHeader === null) return;

	if (!strictNonNegativeIntegerPattern.test(contentLengthHeader)) {
		throw new PayloadTooLargeError(
			'Content-Length header is not a valid non-negative integer.',
			maxBytes,
		);
	}

	const declaredBytes = Number(contentLengthHeader);
	if (declaredBytes > maxBytes) {
		throw new PayloadTooLargeError(
			`Declared Content-Length (${declaredBytes} bytes) exceeds the ${maxBytes}-byte limit.`,
			maxBytes,
		);
	}
}

/**
 * Reads `request.body` directly, accumulating bytes and throwing
 * `PayloadTooLargeError` the instant the cap is crossed — regardless of
 * `Content-Length` — so a chunked body cannot be buffered past the limit.
 * On overflow the underlying reader is cancelled so the connection is torn
 * down rather than left to drain.
 */
export async function readBoundedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
	assertDeclaredContentLengthWithinLimit(request, maxBytes);

	if (!request.body) {
		return new Uint8Array(0);
	}

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let receivedBytes = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		receivedBytes += value.byteLength;
		if (receivedBytes > maxBytes) {
			const error = new PayloadTooLargeError(
				`Request body exceeded the ${maxBytes}-byte limit while streaming.`,
				maxBytes,
			);
			await reader.cancel(error).catch(() => {});
			throw error;
		}

		chunks.push(value);
	}

	const combined = new Uint8Array(receivedBytes);
	let offset = 0;
	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return combined;
}

export async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
	const bytes = await readBoundedBytes(request, maxBytes);
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		throw new InvalidRequestEncodingError('Request body is not valid UTF-8.');
	}
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
	const text = await readBoundedText(request, maxBytes);
	try {
		return JSON.parse(text);
	} catch {
		throw new InvalidRequestEncodingError('Request body is not valid JSON.');
	}
}

/**
 * Parses `application/x-www-form-urlencoded` bodies via `URLSearchParams`
 * rather than the DOM `FormData` API. `FormData` also accepts multipart
 * bodies (not a content type OAuth endpoints declare) and its `.entries()`
 * iteration makes duplicate-key detection awkward; `URLSearchParams.getAll`
 * makes it a direct check.
 */
export async function readBoundedFormUrlEncoded(
	request: Request,
	maxBytes: number,
): Promise<URLSearchParams> {
	const text = await readBoundedText(request, maxBytes);
	return new URLSearchParams(text);
}

/**
 * Wraps `request.body` in a counting stream and returns a new `Request`
 * with the same method/headers/URL, for handing to code that must receive
 * a `Request` object (the MCP SDK's `fetch`-shaped handler). Bytes are
 * counted as the wrapped stream is drained by the eventual consumer, not
 * eagerly, so this call itself does no I/O beyond the synchronous
 * `Content-Length` check.
 */
export function boundRequestBody(request: Request, maxBytes: number): Request {
	assertDeclaredContentLengthWithinLimit(request, maxBytes);

	if (!request.body) {
		return request;
	}

	const reader = request.body.getReader();
	let receivedBytes = 0;

	const limitedStream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						controller.close();
						return;
					}

					receivedBytes += value.byteLength;
					if (receivedBytes > maxBytes) {
						const error = new PayloadTooLargeError(
							`Request body exceeded the ${maxBytes}-byte limit while streaming.`,
							maxBytes,
						);
						controller.error(error);
						await reader.cancel(error).catch(() => {});
						return;
					}

					controller.enqueue(value);
				}
			} catch (error) {
				controller.error(error);
			}
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});

	return new Request(request.url, {
		method: request.method,
		headers: request.headers,
		body: limitedStream,
		// Required by the Fetch spec whenever a `Request` is constructed with
		// a streaming body.
		duplex: 'half',
		signal: request.signal,
	} as RequestInit);
}
