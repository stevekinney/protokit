import { randomBytes } from 'node:crypto';
import { logger } from '@template/mcp/logger';
import { environment } from '@web/env';

function resolveSessionSigningSecret(): string {
	if (environment.SESSION_SIGNING_SECRET) {
		return environment.SESSION_SIGNING_SECRET;
	}

	if (environment.NODE_ENV === 'production') {
		throw new Error(
			'SESSION_SIGNING_SECRET is required in production. Generate one with: openssl rand -hex 32',
		);
	}

	const generated = randomBytes(32).toString('hex');
	logger.warn(
		'SESSION_SIGNING_SECRET not set — using auto-generated secret. Sessions will not survive restarts.',
	);
	return generated;
}

export const sessionSigningSecret: string = resolveSessionSigningSecret();
