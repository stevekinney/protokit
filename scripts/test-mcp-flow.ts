import { logger } from '@template/mcp/logger';

const testLogger = logger.child({ script: 'test-mcp-flow' });

const baseUrl = process.argv.includes('--base-url')
	? process.argv[process.argv.indexOf('--base-url') + 1]
	: 'http://localhost:3000';

type StepResult = {
	step: string;
	success: boolean;
	data?: unknown;
	error?: string;
};

function reportStep(result: StepResult) {
	if (result.success) {
		testLogger.info({ step: result.step, data: result.data }, 'Step passed');
	} else {
		testLogger.error({ step: result.step, error: result.error }, 'Step failed');
	}
}

async function registerClient(): Promise<{
	clientId: string;
	clientSecret: string;
}> {
	const response = await fetch(`${baseUrl}/oauth/register`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_name: 'MCP Flow Test Client',
			redirect_uris: ['http://localhost:9999/callback'],
			grant_types: ['client_credentials'],
			token_endpoint_auth_method: 'client_secret_post',
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Registration failed (${response.status}): ${body}`);
	}

	const data = await response.json();
	return { clientId: data.client_id, clientSecret: data.client_secret };
}

async function exchangeForToken(clientId: string, clientSecret: string): Promise<string> {
	const response = await fetch(`${baseUrl}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: clientId,
			client_secret: clientSecret,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Token exchange failed (${response.status}): ${body}`);
	}

	const data = await response.json();
	return data.access_token;
}

async function initializeMcpSession(accessToken: string): Promise<{
	sessionId: string;
	serverCapabilities: unknown;
}> {
	const response = await fetch(`${baseUrl}/mcp`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'initialize',
			id: 1,
			params: {
				protocolVersion: '2025-11-25',
				capabilities: {},
				clientInfo: { name: 'test-client', version: '0.1.0' },
			},
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`MCP initialize failed (${response.status}): ${body}`);
	}

	const sessionId = response.headers.get('mcp-session-id');
	if (!sessionId) {
		throw new Error('MCP initialize response missing Mcp-Session-Id header');
	}

	const data = await response.json();
	return { sessionId, serverCapabilities: data.result?.capabilities };
}

async function listTools(
	accessToken: string,
	sessionId: string,
): Promise<Array<{ name: string; description?: string }>> {
	const response = await fetch(`${baseUrl}/mcp`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
			Authorization: `Bearer ${accessToken}`,
			'Mcp-Session-Id': sessionId,
			'MCP-Protocol-Version': '2025-11-25',
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'tools/list',
			id: 2,
			params: {},
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`MCP tools/list failed (${response.status}): ${body}`);
	}

	const data = await response.json();
	return data.result?.tools ?? [];
}

async function callGetUserProfile(accessToken: string, sessionId: string): Promise<unknown> {
	const response = await fetch(`${baseUrl}/mcp`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
			Authorization: `Bearer ${accessToken}`,
			'Mcp-Session-Id': sessionId,
			'MCP-Protocol-Version': '2025-11-25',
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'tools/call',
			id: 3,
			params: {
				name: 'get_user_profile',
				arguments: {},
			},
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`MCP tools/call get_user_profile failed (${response.status}): ${body}`);
	}

	const data = await response.json();
	return data.result;
}

async function revokeToken(accessToken: string): Promise<void> {
	const response = await fetch(`${baseUrl}/oauth/revoke`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			token: accessToken,
			token_type_hint: 'access_token',
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Token revocation failed (${response.status}): ${body}`);
	}
}

async function testMcpFlow() {
	testLogger.info({ baseUrl }, 'Starting MCP OAuth flow test');

	// Step 1: Register client
	let clientId: string;
	let clientSecret: string;
	try {
		const registration = await registerClient();
		clientId = registration.clientId;
		clientSecret = registration.clientSecret;
		reportStep({
			step: 'Register client',
			success: true,
			data: { clientId },
		});
	} catch (error) {
		reportStep({
			step: 'Register client',
			success: false,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}

	// Step 2: Get token
	let accessToken: string;
	try {
		accessToken = await exchangeForToken(clientId, clientSecret);
		reportStep({
			step: 'Exchange for token',
			success: true,
			data: { tokenPrefix: accessToken.slice(0, 8) + '...' },
		});
	} catch (error) {
		reportStep({
			step: 'Exchange for token',
			success: false,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}

	// Step 3: Initialize MCP session
	let sessionId: string;
	try {
		const initialization = await initializeMcpSession(accessToken);
		sessionId = initialization.sessionId;
		reportStep({
			step: 'Initialize MCP session',
			success: true,
			data: { sessionId, serverCapabilities: initialization.serverCapabilities },
		});
	} catch (error) {
		reportStep({
			step: 'Initialize MCP session',
			success: false,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}

	// Step 4: List tools
	try {
		const tools = await listTools(accessToken, sessionId);
		const toolNames = tools.map((tool) => tool.name);
		reportStep({
			step: 'List tools',
			success: true,
			data: { toolCount: tools.length, tools: toolNames },
		});
	} catch (error) {
		reportStep({
			step: 'List tools',
			success: false,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}

	// Step 5: Call get_user_profile tool
	try {
		const profileResult = await callGetUserProfile(accessToken, sessionId);
		reportStep({
			step: 'Call get_user_profile',
			success: true,
			data: { result: profileResult },
		});
	} catch (error) {
		reportStep({
			step: 'Call get_user_profile',
			success: false,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}

	// Step 6: Revoke token
	try {
		await revokeToken(accessToken);
		reportStep({ step: 'Revoke token', success: true });
	} catch (error) {
		reportStep({
			step: 'Revoke token',
			success: false,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

testMcpFlow()
	.then(() => {
		testLogger.info('All steps passed');
		process.exit(0);
	})
	.catch((error) => {
		testLogger.error({ err: error }, 'Test flow failed');
		process.exit(1);
	});
