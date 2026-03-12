import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './server.js';
import { hasValidLocalhostRebindingHeaders } from './localhost-request-validation.js';

const port = Number.parseInt(process.env.MCP_CONFORMANCE_PORT ?? '3137', 10);
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

function createStatefulTransport(sessionIdentifier: string) {
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: () => sessionIdentifier,
	});
	transport.onclose = () => {
		transports.delete(sessionIdentifier);
	};
	return transport;
}

async function toWebRequest(
	incomingMessage: import('node:http').IncomingMessage,
	body: string | undefined,
): Promise<Request> {
	const protocol = incomingMessage.headers['x-forwarded-proto'] ?? 'http';
	const host = incomingMessage.headers.host ?? `127.0.0.1:${port}`;
	const url = `${protocol}://${host}${incomingMessage.url ?? '/mcp'}`;
	const headers = new Headers();

	for (const [headerName, headerValue] of Object.entries(incomingMessage.headers)) {
		if (Array.isArray(headerValue)) {
			for (const value of headerValue) {
				headers.append(headerName, value);
			}
			continue;
		}
		if (headerValue !== undefined) {
			headers.set(headerName, headerValue);
		}
	}

	return new Request(url, {
		method: incomingMessage.method ?? 'GET',
		headers,
		body: body ?? undefined,
	});
}

function writeWebResponse(
	serverResponse: import('node:http').ServerResponse<import('node:http').IncomingMessage>,
	webResponse: Response,
): void {
	serverResponse.statusCode = webResponse.status;

	webResponse.headers.forEach((value, key) => {
		serverResponse.setHeader(key, value);
	});

	if (!webResponse.body) {
		serverResponse.end();
		return;
	}

	const bodyStream = Readable.fromWeb(webResponse.body as unknown as NodeReadableStream);
	bodyStream.on('error', () => {
		serverResponse.end();
	});
	bodyStream.pipe(serverResponse);
}

async function handleMcpRequest(request: Request): Promise<Response> {
	const sessionIdentifier = request.headers.get('mcp-session-id');

	if (sessionIdentifier && transports.has(sessionIdentifier)) {
		const transport = transports.get(sessionIdentifier)!;
		return await transport.handleRequest(request);
	}

	if (request.method !== 'POST') {
		return new Response('Session not found', { status: 404 });
	}

	let parsedBody: unknown;
	try {
		parsedBody = await request.json();
	} catch {
		return new Response('Invalid JSON body', { status: 400 });
	}

	const messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
	const isInitialization = messages.some((message) => isInitializeRequest(message));

	if (isInitialization) {
		const newSessionIdentifier = randomUUID();
		const transport = createStatefulTransport(newSessionIdentifier);
		transports.set(newSessionIdentifier, transport);

		const server = createMcpServer({
			userId: randomUUID(),
			enableUiExtension: true,
			enableClientCredentialsExtension: true,
			enableEnterpriseAuthorizationExtension: true,
			enableConformanceMode: true,
		});
		await server.connect(transport);
		return await transport.handleRequest(request, { parsedBody });
	}

	const statelessTransport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	const statelessServer = createMcpServer({
		userId: randomUUID(),
		enableUiExtension: true,
		enableClientCredentialsExtension: true,
		enableEnterpriseAuthorizationExtension: true,
		enableConformanceMode: true,
	});
	await statelessServer.connect(statelessTransport);
	return await statelessTransport.handleRequest(request, { parsedBody });
}

const server = createServer(async (incomingMessage, serverResponse) => {
	if ((incomingMessage.url ?? '').split('?')[0] !== '/mcp') {
		serverResponse.statusCode = 404;
		serverResponse.end('Not found');
		return;
	}

	const headers = new Headers();
	for (const [headerName, headerValue] of Object.entries(incomingMessage.headers)) {
		if (Array.isArray(headerValue)) {
			for (const value of headerValue) {
				headers.append(headerName, value);
			}
			continue;
		}
		if (headerValue !== undefined) {
			headers.set(headerName, headerValue);
		}
	}

	if (!hasValidLocalhostRebindingHeaders(headers)) {
		serverResponse.statusCode = 403;
		serverResponse.end('Forbidden');
		return;
	}

	let body = '';
	incomingMessage.on('data', (chunk: Buffer) => {
		body += chunk.toString('utf-8');
	});

	incomingMessage.on('end', async () => {
		const request = await toWebRequest(incomingMessage, body.length > 0 ? body : undefined);
		const response = await handleMcpRequest(request);
		writeWebResponse(serverResponse, response);
	});
});

server.listen(port, '127.0.0.1', () => {
	console.log(`MCP conformance server listening on http://127.0.0.1:${port}/mcp`);
});
