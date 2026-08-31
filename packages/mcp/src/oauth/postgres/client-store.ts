import type { ClientStore, RegisteredClient } from '../stores.js';
import { resultRows, sql, type PostgresOAuthDatabase } from './database.js';
import type { PostgresOAuthSchema } from './schema.js';

const returnedClient = sql`client_id AS "clientId", client_secret_hash AS "clientSecretHash",
	client_name AS "clientName", client_type AS "clientType", token_endpoint_auth_method AS "tokenEndpointAuthMethod",
	application_type AS "applicationType", redirect_uris AS "redirectUris", grant_types AS "grantTypes",
	response_types AS "responseTypes", client_id_metadata_url AS "clientIdMetadataUrl",
	client_secret_expires_at AS "clientSecretExpiresAt", created_at AS "createdAt", updated_at AS "updatedAt"`;

export class PostgresClientStore implements ClientStore {
	constructor(
		private readonly database: PostgresOAuthDatabase,
		private readonly schema: PostgresOAuthSchema,
	) {}

	async register(record: RegisteredClient): Promise<void> {
		await this.database
			.execute(sql`INSERT INTO ${this.schema.clients} (client_id, client_secret_hash,
			client_name, client_type, token_endpoint_auth_method, application_type, redirect_uris,
			grant_types, response_types, client_id_metadata_url, client_secret_expires_at, created_at, updated_at)
			VALUES (${record.clientId}, ${record.clientSecretHash}, ${record.clientName}, ${record.clientType},
			${record.tokenEndpointAuthMethod}, ${record.applicationType}, ${JSON.stringify(record.redirectUris)}::jsonb,
			${JSON.stringify(record.grantTypes)}::jsonb, ${JSON.stringify(record.responseTypes)}::jsonb,
			${record.clientIdMetadataUrl}, ${record.clientSecretExpiresAt}, ${record.createdAt}, ${record.updatedAt})`);
	}

	async upsert(record: RegisteredClient): Promise<void> {
		await this.database
			.execute(sql`INSERT INTO ${this.schema.clients} (client_id, client_secret_hash,
			client_name, client_type, token_endpoint_auth_method, application_type, redirect_uris,
			grant_types, response_types, client_id_metadata_url, client_secret_expires_at, created_at, updated_at)
			VALUES (${record.clientId}, ${record.clientSecretHash}, ${record.clientName}, ${record.clientType},
			${record.tokenEndpointAuthMethod}, ${record.applicationType}, ${JSON.stringify(record.redirectUris)}::jsonb,
			${JSON.stringify(record.grantTypes)}::jsonb, ${JSON.stringify(record.responseTypes)}::jsonb,
			${record.clientIdMetadataUrl}, ${record.clientSecretExpiresAt}, ${record.createdAt}, ${record.updatedAt})
			ON CONFLICT (client_id) DO UPDATE SET client_secret_hash = EXCLUDED.client_secret_hash,
			client_name = EXCLUDED.client_name, client_type = EXCLUDED.client_type,
			token_endpoint_auth_method = EXCLUDED.token_endpoint_auth_method, application_type = EXCLUDED.application_type,
			redirect_uris = EXCLUDED.redirect_uris, grant_types = EXCLUDED.grant_types,
			response_types = EXCLUDED.response_types, client_id_metadata_url = EXCLUDED.client_id_metadata_url,
			client_secret_expires_at = EXCLUDED.client_secret_expires_at, created_at = EXCLUDED.created_at,
			updated_at = EXCLUDED.updated_at`);
	}

	async findById(clientId: string): Promise<RegisteredClient | null> {
		const result = await this.database.execute(
			sql`SELECT ${returnedClient} FROM ${this.schema.clients} WHERE client_id = ${clientId}`,
		);
		const client = resultRows<RegisteredClient>(result)[0];
		return client ? structuredClone(client) : null;
	}

	async update(clientId: string, patch: Partial<RegisteredClient>): Promise<void> {
		const current = await this.findById(clientId);
		if (!current) return;
		await this.upsert({ ...current, ...structuredClone(patch), clientId });
	}
}
