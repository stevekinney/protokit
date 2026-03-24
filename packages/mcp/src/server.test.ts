import { describe, it, expect } from 'bun:test';
import { createMcpServer } from './server';

describe('createMcpServer', () => {
	it('returns a defined server instance', () => {
		const server = createMcpServer({
			userId: 'test-user-id',
			user: {
				id: 'test-user-id',
				email: 'test@example.com',
				name: 'Test User',
				image: null,
				role: 'user',
			},
			enableUiExtension: true,
			enableClientCredentialsExtension: true,
			enableEnterpriseAuthorizationExtension: true,
			enableConformanceMode: false,
		});
		expect(server).toBeDefined();
	});
});
