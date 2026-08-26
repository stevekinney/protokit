import { beforeEach, describe, expect, it, mock } from 'bun:test';

const mockEnvironment: Record<string, unknown> = {
	NODE_ENV: 'development',
	PROTOKIT_TUNNEL_ACTIVE: false,
};

let mockExistingUsers: Array<{ id: string }> = [];
let mockRateLimitAllowed = true;
let mockRateLimitRetryAfterSeconds = 0;
let mockCreateSessionShouldThrow = false;
const mockLoggedErrors: unknown[] = [];

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

mock.module('@template/database', () => ({
	database: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => mockExistingUsers,
				}),
			}),
		}),
		insert: () => ({
			values: async () => {},
		}),
	},
	schema: {
		users: { id: 'id', email: 'email' },
	},
}));

mock.module('@template/mcp/logger', () => ({
	logger: {
		info: () => {},
		error: (payload: unknown) => {
			mockLoggedErrors.push(payload);
		},
	},
}));

mock.module('@web/lib/request-rate-limiter', () => ({
	enforceSessionCreationRateLimit: async () => ({
		allowed: mockRateLimitAllowed,
		retryAfterSeconds: mockRateLimitRetryAfterSeconds,
		remainingRequests: mockRateLimitAllowed ? 10 : 0,
	}),
}));

mock.module('@web/lib/session-authentication', () => ({
	createSession: async () => {
		if (mockCreateSessionShouldThrow) {
			throw new Error('simulated session creation failure');
		}
		return {
			cookieHeaderValue: 'application_session=token; HttpOnly',
			sessionToken: 'mock-session-token',
		};
	},
}));

const { handleDevelopmentLogin } = await import('@web/routes/development-authentication-routes');

function createContext() {
	return {
		request: new Request('http://localhost:3000/auth/dev/login'),
		requestUrl: new URL('http://localhost:3000/auth/dev/login'),
		requestId: 'req-1',
		networkIdentity: '203.0.113.1',
		user: null,
		sessionToken: null,
	};
}

describe('handleDevelopmentLogin', () => {
	beforeEach(() => {
		mockExistingUsers = [];
		mockRateLimitAllowed = true;
		mockRateLimitRetryAfterSeconds = 0;
		mockCreateSessionShouldThrow = false;
		mockLoggedErrors.length = 0;
	});

	it('creates a session when NODE_ENV is development and no tunnel is active', async () => {
		mockEnvironment.NODE_ENV = 'development';
		mockEnvironment.PROTOKIT_TUNNEL_ACTIVE = false;
		const response = await handleDevelopmentLogin(createContext());
		expect(response.status).toBe(302);
		expect(response.headers.get('set-cookie')).toContain('application_session=');
	});

	it('reuses the existing development user instead of inserting a new one', async () => {
		mockEnvironment.NODE_ENV = 'development';
		mockEnvironment.PROTOKIT_TUNNEL_ACTIVE = false;
		mockExistingUsers = [{ id: 'existing-dev-user-id' }];
		const response = await handleDevelopmentLogin(createContext());
		expect(response.status).toBe(302);
		expect(response.headers.get('set-cookie')).toContain('application_session=');
	});

	it('returns 429 with Retry-After when the session-creation rate limit is exceeded', async () => {
		mockEnvironment.NODE_ENV = 'development';
		mockEnvironment.PROTOKIT_TUNNEL_ACTIVE = false;
		mockRateLimitAllowed = false;
		mockRateLimitRetryAfterSeconds = 17;
		const response = await handleDevelopmentLogin(createContext());
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('17');
	});

	it('returns 500 and logs when session creation throws', async () => {
		mockEnvironment.NODE_ENV = 'development';
		mockEnvironment.PROTOKIT_TUNNEL_ACTIVE = false;
		mockCreateSessionShouldThrow = true;
		const response = await handleDevelopmentLogin(createContext());
		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body).toEqual({
			error: 'internal_error',
			error_description: 'Development login failed',
		});
		expect(mockLoggedErrors).toHaveLength(1);
	});

	it('returns 404 in production regardless of tunnel state', async () => {
		mockEnvironment.NODE_ENV = 'production';
		mockEnvironment.PROTOKIT_TUNNEL_ACTIVE = false;
		const response = await handleDevelopmentLogin(createContext());
		expect(response.status).toBe(404);
	});

	it('returns 404 in test', async () => {
		mockEnvironment.NODE_ENV = 'test';
		mockEnvironment.PROTOKIT_TUNNEL_ACTIVE = false;
		const response = await handleDevelopmentLogin(createContext());
		expect(response.status).toBe(404);
	});

	it('returns 404 in development when a tunnel is active, even though NODE_ENV allows it', async () => {
		mockEnvironment.NODE_ENV = 'development';
		mockEnvironment.PROTOKIT_TUNNEL_ACTIVE = true;
		const response = await handleDevelopmentLogin(createContext());
		expect(response.status).toBe(404);
	});
});
