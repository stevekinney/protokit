export function getBaseUrl(request: Request): string {
	const requestUrl = new URL(request.url);
	const protocol = request.headers.get('x-forwarded-proto') ?? requestUrl.protocol.replace(':', '');
	const host =
		request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? requestUrl.host;
	return `${protocol}://${host}`;
}
