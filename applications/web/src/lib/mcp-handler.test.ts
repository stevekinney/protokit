import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/mcp-session-store', () => ({
	mcpSessionStore: {
		getSession: vi.fn(async () => ({
			sessionId: 'session-1',
			userId: 'user-1',
			ownerInstanceId: 'other-instance',
			lastActivityAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 1000 * 60).toISOString(),
		})),
		touchSession: vi.fn(async () => null),
		deleteSession: vi.fn(async () => undefined),
		createSession: vi.fn(async () => undefined),
	},
}));

const { handleMcpRequest } = await import('$lib/mcp-handler');

describe('handleMcpRequest session affinity', () => {
	it('rejects non-allowlisted origin', async () => {
		const request = new Request('http://localhost/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				origin: 'https://untrusted.example',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: '1',
				method: 'initialize',
				params: {
					protocolVersion: '2025-11-25',
					capabilities: {},
					clientInfo: { name: 'test', version: '1.0.0' },
				},
			}),
		});

		const response = await handleMcpRequest(request, 'user-1');
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			error: 'forbidden',
		});
	});

	it('enforces latest protocol version on initialize', async () => {
		const request = new Request('http://localhost/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				origin: 'http://localhost:3000',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: '1',
				method: 'initialize',
				params: {
					protocolVersion: '2025-03-26',
					capabilities: {},
					clientInfo: { name: 'test', version: '1.0.0' },
				},
			}),
		});

		const response = await handleMcpRequest(request, 'user-1');
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: 'bad_request',
		});
	});

	it('returns 409 with reconnect action when request lands on non-owner instance', async () => {
		const request = new Request('http://localhost/mcp', {
			method: 'GET',
			headers: {
				'mcp-session-id': 'session-1',
				'mcp-protocol-version': '2025-11-25',
				accept: 'text/event-stream',
				origin: 'http://localhost:3000',
			},
		});

		const response = await handleMcpRequest(request, 'user-1');
		expect(response.status).toBe(409);
		const payload = await response.json();
		expect(payload).toMatchObject({
			error: 'session_affinity_required',
			action: 'reconnect',
			session_id: 'session-1',
		});
	});
});
