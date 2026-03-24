import { describe, it, expect, mock, beforeEach } from 'bun:test';

const mockEnvironment = { BASE_URL: undefined as string | undefined };

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

const { getBaseUrl } = await import('./base-url');

function createRequest(url: string, headers?: Record<string, string>): Request {
	return new Request(url, { headers });
}

describe('getBaseUrl', () => {
	beforeEach(() => {
		mockEnvironment.BASE_URL = undefined;
	});

	it('returns BASE_URL when set, ignoring request headers', () => {
		mockEnvironment.BASE_URL = 'https://myapp.example.com';
		const request = createRequest('http://localhost:3000/path', {
			'x-forwarded-host': 'evil.example.com',
			'x-forwarded-proto': 'https',
		});

		expect(getBaseUrl(request)).toBe('https://myapp.example.com');
	});

	it('strips trailing slash from BASE_URL', () => {
		mockEnvironment.BASE_URL = 'https://myapp.example.com/';

		const request = createRequest('http://localhost:3000/path');
		expect(getBaseUrl(request)).toBe('https://myapp.example.com');
	});

	it('strips multiple trailing slashes from BASE_URL', () => {
		mockEnvironment.BASE_URL = 'https://myapp.example.com///';

		const request = createRequest('http://localhost:3000/path');
		expect(getBaseUrl(request)).toBe('https://myapp.example.com');
	});

	it('derives base URL from request.url when BASE_URL is not set', () => {
		const request = createRequest('http://localhost:3000/some/path?query=1');

		expect(getBaseUrl(request)).toBe('http://localhost:3000');
	});

	it('ignores X-Forwarded-Host header when BASE_URL is not set', () => {
		const request = createRequest('http://localhost:3000/path', {
			'x-forwarded-host': 'evil.example.com',
		});

		expect(getBaseUrl(request)).toBe('http://localhost:3000');
	});

	it('ignores X-Forwarded-Proto header when BASE_URL is not set', () => {
		const request = createRequest('http://localhost:3000/path', {
			'x-forwarded-proto': 'https',
		});

		expect(getBaseUrl(request)).toBe('http://localhost:3000');
	});

	it('ignores both X-Forwarded-Host and X-Forwarded-Proto headers when BASE_URL is not set', () => {
		const request = createRequest('http://localhost:3000/path', {
			'x-forwarded-host': 'evil.example.com',
			'x-forwarded-proto': 'https',
		});

		expect(getBaseUrl(request)).toBe('http://localhost:3000');
	});
});
