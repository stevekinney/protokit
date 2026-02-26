import { describe, it, expect } from 'bun:test';
import { createMcpServer } from './server';

describe('createMcpServer', () => {
	it('returns a defined server instance', () => {
		const server = createMcpServer({ userId: 'test-user-id' });
		expect(server).toBeDefined();
	});
});
