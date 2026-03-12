function getFirstHeaderValue(headers: Headers, name: string): string | null {
	const value = headers.get(name);
	if (!value) {
		return null;
	}

	return value.split(',')[0]?.trim() || null;
}

export function getRequestClientIdentifier(input: {
	request: Request;
	fallbackClientAddress?: string;
}): string {
	const forwardedFor = getFirstHeaderValue(input.request.headers, 'x-forwarded-for');
	if (forwardedFor) {
		return forwardedFor;
	}

	const connectingIp = getFirstHeaderValue(input.request.headers, 'cf-connecting-ip');
	if (connectingIp) {
		return connectingIp;
	}

	if (input.fallbackClientAddress) {
		return input.fallbackClientAddress;
	}

	return 'unknown-client';
}
