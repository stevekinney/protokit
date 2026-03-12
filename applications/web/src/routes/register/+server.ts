import { json } from '@sveltejs/kit';
import { randomUUID, randomBytes } from 'node:crypto';
import type { RequestHandler } from './$types';
import { database, schema } from '@template/database';
import { z } from 'zod';
import { isValidRedirectUri } from '$lib/validate-redirect-uri';
import { hashCredential } from '$lib/hash-credential';
import { corsHeaders, handleCorsPreflight } from '$lib/cors';
import { enforceRegistrationRateLimit } from '$lib/request-rate-limiter';
import { createRateLimitedResponse } from '$lib/rate-limit-response';
import { environment } from '../../env.js';

export const OPTIONS = handleCorsPreflight;

const supportedGrantTypes = ['authorization_code', 'refresh_token', 'client_credentials'] as const;
const supportedResponseTypes = ['code'] as const;
const supportedTokenEndpointAuthenticationMethods = ['client_secret_post', 'none'] as const;

const registrationSchema = z.object({
	client_name: z.string().min(1).default('Unknown Client'),
	redirect_uris: z
		.array(z.string().url())
		.min(1, 'At least one redirect URI is required')
		.refine(
			(uris) => uris.every(isValidRedirectUri),
			'Redirect URIs must use HTTPS (or http://localhost for development)',
		),
	grant_types: z
		.array(z.enum(supportedGrantTypes))
		.default(['authorization_code', 'refresh_token']),
	response_types: z.array(z.enum(supportedResponseTypes)).default(['code']),
	token_endpoint_auth_method: z
		.enum(supportedTokenEndpointAuthenticationMethods)
		.default('client_secret_post'),
});

export const POST: RequestHandler = async (event) => {
	const rateLimitResult = await enforceRegistrationRateLimit(event);
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds, corsHeaders);
	}

	const { request } = event;
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json(
			{ error: 'invalid_request', error_description: 'Invalid JSON body' },
			{ status: 400, headers: corsHeaders },
		);
	}

	const result = registrationSchema.safeParse(body);
	if (!result.success) {
		return json(
			{
				error: 'invalid_client_metadata',
				error_description: result.error.issues.map((i) => i.message).join('; '),
			},
			{ status: 400, headers: corsHeaders },
		);
	}

	const { client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method } =
		result.data;
	const includesClientCredentialsGrant = grant_types.includes('client_credentials');

	if (includesClientCredentialsGrant && !environment.MCP_ENABLE_CLIENT_CREDENTIALS) {
		return json(
			{
				error: 'invalid_client_metadata',
				error_description: 'client_credentials is disabled on this server.',
			},
			{ status: 400, headers: corsHeaders },
		);
	}

	if (token_endpoint_auth_method === 'none' && includesClientCredentialsGrant) {
		return json(
			{
				error: 'invalid_client_metadata',
				error_description:
					'client_credentials requires token_endpoint_auth_method=client_secret_post.',
			},
			{ status: 400, headers: corsHeaders },
		);
	}

	if (token_endpoint_auth_method === 'none' && grant_types.includes('refresh_token')) {
		return json(
			{
				error: 'invalid_client_metadata',
				error_description: 'refresh_token requires token_endpoint_auth_method=client_secret_post.',
			},
			{ status: 400, headers: corsHeaders },
		);
	}

	const clientId = randomUUID();
	const clientSecret = randomBytes(32).toString('hex');
	const serviceAccountUserId = includesClientCredentialsGrant ? randomUUID() : null;

	if (serviceAccountUserId) {
		await database.insert(schema.neonAuthUsers).values({
			id: serviceAccountUserId,
			name: `${client_name} service account`,
			email: `mcp-service-${clientId}@local.invalid`,
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			role: 'service',
			banned: false,
			banReason: null,
			banExpires: null,
		});
	}

	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: hashCredential(clientSecret),
		clientName: client_name,
		clientType: token_endpoint_auth_method === 'none' ? 'public' : 'confidential',
		tokenEndpointAuthMethod: token_endpoint_auth_method,
		serviceAccountUserId,
		redirectUris: redirect_uris,
		grantTypes: grant_types,
		responseTypes: response_types,
	});

	return json(
		{
			client_id: clientId,
			client_secret: clientSecret,
			client_name,
			redirect_uris,
			grant_types,
			response_types,
			token_endpoint_auth_method,
			client_id_issued_at: Math.floor(Date.now() / 1000),
			client_secret_expires_at: 0,
		},
		{ status: 201, headers: corsHeaders },
	);
};
