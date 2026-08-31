import { isExactContentType } from './security-utilities.js';

export const oauthRegisterMaximumBodyBytes = 16 * 1024;
export const oauthTokenMaximumBodyBytes = 8 * 1024;
export const oauthRevokeMaximumBodyBytes = 4 * 1024;
export const oauthAuthorizeApproveMaximumBodyBytes = 4 * 1024;
export const oauthAuthorizeDenyMaximumBodyBytes = 4 * 1024;

export class PayloadTooLargeError extends Error {}
export class InvalidOauthRequestBodyError extends Error {
	constructor(
		message: string,
		readonly kind: 'unsupported_content_type' | 'invalid_request' = 'invalid_request',
	) {
		super(message);
	}
}

export async function readBoundedText(request: Request, maximumBytes: number): Promise<string> {
	const declaredLength = request.headers.get('content-length');
	if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)) {
		throw new PayloadTooLargeError('Request body too large');
	}
	if (!request.body) return '';
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let byteCount = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		byteCount += value.byteLength;
		if (byteCount > maximumBytes) {
			await reader.cancel().catch(() => {});
			throw new PayloadTooLargeError('Request body too large');
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(byteCount);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		throw new InvalidOauthRequestBodyError('Request body is not valid UTF-8');
	}
}

export async function readOauthJson(request: Request, maximumBytes: number): Promise<unknown> {
	if (!isExactContentType(request.headers.get('content-type'), 'application/json')) {
		throw new InvalidOauthRequestBodyError(
			'Content-Type must be application/json',
			'unsupported_content_type',
		);
	}
	try {
		return JSON.parse(await readBoundedText(request, maximumBytes));
	} catch (error) {
		if (error instanceof PayloadTooLargeError || error instanceof InvalidOauthRequestBodyError)
			throw error;
		throw new InvalidOauthRequestBodyError('Invalid JSON body');
	}
}

const knownParameters = new Set([
	'grant_type',
	'code',
	'redirect_uri',
	'client_id',
	'client_secret',
	'code_verifier',
	'refresh_token',
	'token',
	'token_type_hint',
	'resource',
	'scope',
]);

export async function readOauthParameters(
	request: Request,
	maximumBytes: number,
): Promise<Record<string, string>> {
	let entries: Array<[string, unknown]>;
	if (
		isExactContentType(request.headers.get('content-type'), 'application/x-www-form-urlencoded')
	) {
		const parameters = new URLSearchParams(await readBoundedText(request, maximumBytes));
		for (const name of knownParameters) {
			if (parameters.getAll(name).length > 1)
				throw new InvalidOauthRequestBodyError(`Duplicate parameter: ${name}`);
		}
		entries = [...parameters.entries()];
	} else if (isExactContentType(request.headers.get('content-type'), 'application/json')) {
		const parsed = await readOauthJson(request, maximumBytes);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
			throw new InvalidOauthRequestBodyError('Request body must be an object');
		entries = Object.entries(parsed);
	} else {
		throw new InvalidOauthRequestBodyError('Unsupported Content-Type', 'unsupported_content_type');
	}
	const result: Record<string, string> = {};
	for (const [name, value] of entries) {
		if (typeof value !== 'string')
			throw new InvalidOauthRequestBodyError(`Parameter must be a string: ${name}`);
		result[name] = value;
	}
	return result;
}
