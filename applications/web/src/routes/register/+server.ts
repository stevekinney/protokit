import { json } from '@sveltejs/kit';
import { randomUUID, randomBytes } from 'node:crypto';
import type { RequestHandler } from './$types';
import { database, schema } from '@template/database';
import { z } from 'zod';
import { isValidRedirectUri } from '$lib/validate-redirect-uri';

const registrationSchema = z.object({
	client_name: z.string().min(1).default('Unknown Client'),
	redirect_uris: z
		.array(z.string().url())
		.min(1, 'At least one redirect URI is required')
		.refine(
			(uris) => uris.every(isValidRedirectUri),
			'Redirect URIs must use HTTPS (or http://localhost for development)',
		),
	grant_types: z.array(z.string()).default(['authorization_code']),
	response_types: z.array(z.string()).default(['code']),
});

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json(
			{ error: 'invalid_request', error_description: 'Invalid JSON body' },
			{ status: 400 },
		);
	}

	const result = registrationSchema.safeParse(body);
	if (!result.success) {
		return json(
			{
				error: 'invalid_client_metadata',
				error_description: result.error.issues.map((i) => i.message).join('; '),
			},
			{ status: 400 },
		);
	}

	const { client_name, redirect_uris, grant_types, response_types } = result.data;

	const clientId = randomUUID();
	const clientSecret = randomBytes(32).toString('hex');

	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret,
		clientName: client_name,
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
			client_id_issued_at: Math.floor(Date.now() / 1000),
			client_secret_expires_at: 0,
		},
		{ status: 201 },
	);
};
