import { environment } from '@web/env';

function hasEnterprisePolicyConfiguration(): boolean {
	return Boolean(
		environment.ENTERPRISE_AUTH_PROVIDER_URL &&
		environment.ENTERPRISE_AUTH_TENANT &&
		environment.ENTERPRISE_AUTH_AUDIENCE &&
		environment.ENTERPRISE_AUTH_CLIENT_ID &&
		environment.ENTERPRISE_AUTH_CLIENT_SECRET,
	);
}

function getAllowedClientIdentifiers(): Set<string> {
	const values = (environment.ENTERPRISE_AUTH_ALLOWED_CLIENT_IDS ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	return new Set(values);
}

export async function evaluateEnterpriseAuthorizationPolicy(input: {
	clientId: string;
	userId: string | null;
	action: 'issue_token' | 'access_mcp';
}): Promise<{ allowed: true } | { allowed: false; reason: string }> {
	if (!environment.MCP_ENABLE_ENTERPRISE_AUTH) {
		return { allowed: true };
	}

	if (!hasEnterprisePolicyConfiguration()) {
		return { allowed: false, reason: 'enterprise_policy_not_configured' };
	}

	const allowedClientIdentifiers = getAllowedClientIdentifiers();
	if (allowedClientIdentifiers.size === 0) {
		return { allowed: false, reason: 'enterprise_policy_denied' };
	}

	if (!allowedClientIdentifiers.has(input.clientId)) {
		return { allowed: false, reason: 'enterprise_policy_denied' };
	}

	return { allowed: true };
}
