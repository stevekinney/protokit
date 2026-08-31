import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { OAuthRequestContext, OAuthStatelessHostSeams } from './index.js';
import { oauthBodyError, oauthJson } from './endpoint-responses.js';
import { rateLimitResponse } from './endpoint-rate-limits.js';
import {
	InvalidOauthRequestBodyError,
	oauthRegisterMaximumBodyBytes,
	PayloadTooLargeError,
	readOauthJson,
} from './request-body.js';
import { isValidClientName, isValidRedirectUri } from './security-utilities.js';

const registrationSchema = z
	.object({
		client_name: z.string().min(1).max(200).refine(isValidClientName).default('Unknown Client'),
		redirect_uris: z
			.array(z.string().url().max(2048))
			.min(1)
			.max(10)
			.refine((values) => values.every(isValidRedirectUri)),
		grant_types: z
			.array(z.enum(['authorization_code', 'refresh_token']))
			.max(5)
			.default(['authorization_code', 'refresh_token']),
		response_types: z.array(z.literal('code')).max(5).default(['code']),
		token_endpoint_auth_method: z
			.enum(['client_secret_post', 'none'])
			.default('client_secret_post'),
		application_type: z.enum(['web', 'native']).optional(),
	})
	.superRefine((value, refinement) => {
		if (
			value.application_type === 'web' &&
			value.redirect_uris.some((uri) => new URL(uri).protocol !== 'https:')
		) {
			refinement.addIssue({
				code: 'custom',
				path: ['redirect_uris'],
				message: 'application_type "web" requires HTTPS redirect URIs',
			});
		}
	});

export async function handleOauthRegisterPost<Scope extends string>(
	context: OAuthRequestContext,
	seams: OAuthStatelessHostSeams<Scope>,
): Promise<Response> {
	const limited = await rateLimitResponse({ context, seams, category: 'oauth_register' });
	if (limited) return limited;
	let input: unknown;
	try {
		input = await readOauthJson(context.request, oauthRegisterMaximumBodyBytes);
	} catch (error) {
		if (error instanceof PayloadTooLargeError)
			return oauthJson(
				{ error: 'invalid_client_metadata', error_description: 'Request body too large' },
				413,
			);
		if (error instanceof InvalidOauthRequestBodyError) {
			if (error.kind === 'unsupported_content_type')
				return oauthJson(
					{
						error: 'invalid_client_metadata',
						error_description: 'Content-Type must be application/json',
					},
					400,
				);
			return oauthJson({ error: 'invalid_request', error_description: 'Invalid JSON body' }, 400);
		}
		return oauthBodyError(error);
	}
	const parsed = registrationSchema.safeParse(input);
	if (!parsed.success)
		return oauthJson(
			{
				error: 'invalid_client_metadata',
				error_description: parsed.error.issues.map((issue) => issue.message).join('; '),
			},
			400,
		);

	const now = new Date();
	const publicClient = parsed.data.token_endpoint_auth_method === 'none';
	const clientId = randomUUID();
	const clientSecret = publicClient ? null : randomBytes(32).toString('hex');
	const clientSecretExpiresAt = clientSecret
		? new Date(now.getTime() + seams.configuration.clientSecretTtlSeconds * 1000)
		: null;
	await seams.stores.clients.register({
		clientId,
		clientSecretHash: clientSecret ? seams.hashCredential(clientSecret) : null,
		clientSecretExpiresAt,
		clientName: parsed.data.client_name,
		clientType: publicClient ? 'public' : 'confidential',
		tokenEndpointAuthMethod: parsed.data.token_endpoint_auth_method,
		applicationType: parsed.data.application_type ?? null,
		redirectUris: parsed.data.redirect_uris,
		grantTypes: parsed.data.grant_types,
		responseTypes: parsed.data.response_types,
		clientIdMetadataUrl: null,
		createdAt: now,
		updatedAt: now,
	});
	seams.recordEvent?.({
		category: 'registration',
		outcome: 'success',
		attributes: { clientId, isPublicClient: publicClient },
	});
	return oauthJson(
		{
			client_id: clientId,
			...(clientSecret && clientSecretExpiresAt
				? {
						client_secret: clientSecret,
						client_secret_expires_at: Math.floor(clientSecretExpiresAt.getTime() / 1000),
					}
				: {}),
			client_name: parsed.data.client_name,
			redirect_uris: parsed.data.redirect_uris,
			grant_types: parsed.data.grant_types,
			response_types: parsed.data.response_types,
			token_endpoint_auth_method: parsed.data.token_endpoint_auth_method,
			...(parsed.data.application_type ? { application_type: parsed.data.application_type } : {}),
			client_id_issued_at: Math.floor(now.getTime() / 1000),
		},
		201,
		{ 'Cache-Control': 'no-store, private', Vary: 'Cookie' },
	);
}
