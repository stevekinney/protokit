import { environment } from '@web/env';

export function getBaseUrl(request: Request): string {
	if (environment.baseUrl) {
		return environment.baseUrl.replace(/\/+$/, '');
	}

	const url = new URL(request.url);
	return `${url.protocol}//${url.host}`;
}
