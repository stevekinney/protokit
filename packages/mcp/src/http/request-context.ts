import type { AuthInfo } from '@modelcontextprotocol/server';

import type { McpUserProfile } from '../types/primitives.js';

export type McpRequestAuthExtra = {
	userId: string;
	userProfile: McpUserProfile;
	oauthClientId: string;
	scopes: string[];
	resource: string;
	networkIdentity?: string;
	requestId?: string;
};

export function buildMcpAuthInfo(input: {
	accessToken: string;
	expiresAt: Date;
	extra: McpRequestAuthExtra;
}): AuthInfo {
	return {
		token: input.accessToken,
		clientId: input.extra.oauthClientId,
		scopes: input.extra.scopes,
		expiresAt: Math.floor(input.expiresAt.getTime() / 1000),
		resource: new URL(input.extra.resource),
		extra: input.extra,
	};
}

export function readMcpRequestAuthExtra(
	authInfo: AuthInfo | undefined,
): McpRequestAuthExtra | undefined {
	const extra = authInfo?.extra;
	if (!extra || typeof extra !== 'object') return undefined;
	const candidate = extra as Partial<McpRequestAuthExtra>;
	if (typeof candidate.userId !== 'string') return undefined;
	if (typeof candidate.userProfile?.id !== 'string') return undefined;
	return candidate as McpRequestAuthExtra;
}
