import type { RequestEvent } from '@sveltejs/kit';

export function getBaseUrl(event: RequestEvent): string {
	const protocol =
		event.request.headers.get('x-forwarded-proto') || event.url.protocol.replace(':', '');
	const host = event.url.host;
	return `${protocol}://${host}`;
}
