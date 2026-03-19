const COOKIE_SEPARATOR = ';';

function decodeCookieComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function parseCookies(cookieHeaderValue: string | null): Map<string, string> {
	if (!cookieHeaderValue) {
		return new Map();
	}

	const entries = cookieHeaderValue
		.split(COOKIE_SEPARATOR)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.map((entry) => {
			const separatorIndex = entry.indexOf('=');
			if (separatorIndex < 0) {
				return null;
			}

			const rawKey = entry.slice(0, separatorIndex).trim();
			const rawValue = entry.slice(separatorIndex + 1);
			const key = decodeCookieComponent(rawKey);
			const value = decodeCookieComponent(rawValue);
			return [key, value] as const;
		})
		.filter((entry): entry is readonly [string, string] => entry !== null);

	return new Map(entries);
}

export function serializeCookie(input: {
	name: string;
	value: string;
	maxAgeSeconds?: number;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: 'Lax' | 'Strict' | 'None';
	path?: string;
}): string {
	const encodedName = encodeURIComponent(input.name);
	const encodedValue = encodeURIComponent(input.value);
	const segments = [`${encodedName}=${encodedValue}`];

	segments.push(`Path=${input.path ?? '/'}`);

	if (typeof input.maxAgeSeconds === 'number') {
		segments.push(`Max-Age=${Math.max(0, Math.floor(input.maxAgeSeconds))}`);
	}

	if (input.httpOnly !== false) {
		segments.push('HttpOnly');
	}

	if (input.secure) {
		segments.push('Secure');
	}

	segments.push(`SameSite=${input.sameSite ?? 'Lax'}`);

	return segments.join('; ');
}
