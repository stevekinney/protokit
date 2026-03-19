import { environment } from '@web/env';

function parseAllowedOrigins(): Set<string> {
	const rawAllowedOrigins = environment.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';
	const values = rawAllowedOrigins
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	return new Set(values);
}

const allowedOrigins = parseAllowedOrigins();

export function validateMcpRequestOrigin(request: Request): { allowed: true } | { allowed: false } {
	const requestOrigin = request.headers.get('origin');

	// Non-browser clients commonly omit Origin; allow by default.
	if (!requestOrigin) {
		return { allowed: true };
	}

	// Sandboxed/null origins are not trusted for this server.
	if (requestOrigin === 'null') {
		return { allowed: false };
	}

	if (!allowedOrigins.has(requestOrigin)) {
		return { allowed: false };
	}

	return { allowed: true };
}

export function createMcpCorsHeaders(request: Request): Record<string, string> {
	const requestOrigin = request.headers.get('origin');
	if (!requestOrigin || requestOrigin === 'null' || !allowedOrigins.has(requestOrigin)) {
		return {};
	}

	return {
		'Access-Control-Allow-Origin': requestOrigin,
		Vary: 'Origin',
		'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
		'Access-Control-Allow-Headers':
			'Content-Type, Authorization, mcp-session-id, mcp-protocol-version, Last-Event-ID',
		'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
	};
}
