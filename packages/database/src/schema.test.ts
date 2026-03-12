import { describe, it, expect } from 'bun:test';
import * as schema from './schema';

describe('database schema exports', () => {
	it('exports users', () => {
		expect(schema.users).toBeDefined();
	});

	it('exports userSessions', () => {
		expect(schema.userSessions).toBeDefined();
	});

	it('exports userGoogleAccounts', () => {
		expect(schema.userGoogleAccounts).toBeDefined();
	});

	it('exports oauthClients', () => {
		expect(schema.oauthClients).toBeDefined();
	});

	it('exports oauthCodes', () => {
		expect(schema.oauthCodes).toBeDefined();
	});

	it('exports oauthTokens', () => {
		expect(schema.oauthTokens).toBeDefined();
	});

	it('exports mcpSessions', () => {
		expect(schema.mcpSessions).toBeDefined();
	});
});
