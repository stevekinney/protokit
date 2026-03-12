import type { RequestEvent } from '@sveltejs/kit';

function getFirstHeaderValue(headers: Headers, name: string): string | null {
	const value = headers.get(name);
	if (!value) return null;
	return value.split(',')[0]?.trim() || null;
}

export function getRequestClientIdentifier(
	event: Pick<RequestEvent, 'request' | 'getClientAddress'>,
): string {
	const forwardedFor = getFirstHeaderValue(event.request.headers, 'x-forwarded-for');
	if (forwardedFor) return forwardedFor;

	const connectingIp = getFirstHeaderValue(event.request.headers, 'cf-connecting-ip');
	if (connectingIp) return connectingIp;

	try {
		return event.getClientAddress();
	} catch {
		return 'unknown-client';
	}
}
