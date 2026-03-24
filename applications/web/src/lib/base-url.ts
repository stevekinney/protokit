import { environment } from '@web/env';

export function getBaseUrl(request: Request): string {
	if (environment.BASE_URL) {
		return environment.BASE_URL.replace(/\/+$/, '');
	}

	const url = new URL(request.url);
	return `${url.protocol}//${url.host}`;
}
