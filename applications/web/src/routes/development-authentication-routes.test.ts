import { describe, expect, it, mock } from 'bun:test';

const mockEnvironment: Record<string, unknown> = {
	NODE_ENV: 'development',
	PROTOKIT_TUNNEL_ACTIVE: false,
};

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

mock.module('@template/database', () => ({
	database: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => [],
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
	logger: { info: () => {}, error: () => {} },
}));

mock.module('@web/lib/request-rate-limiter', () => ({
	enforceSessionCreationRateLimit: async () => ({
		allowed: true,
		retryAfterSeconds: 0,
		remainingRequests: 10,
	}),
}));

mock.module('@web/lib/session-authentication', () => ({
	createSession: async () => ({
		cookieHeaderValue: 'application_session=token; HttpOnly',
		sessionToken: 'mock-session-token',
	}),
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
	it('creates a session when NODE_ENV is development and no tunnel is active', async () => {
		mockEnvironment.NODE_ENV = 'development';
		mockEnvironment.PROTOKIT_TUNNEL_ACTIVE = false;
		const response = await handleDevelopmentLogin(createContext());
		expect(response.status).toBe(302);
		expect(response.headers.get('set-cookie')).toContain('application_session=');
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
