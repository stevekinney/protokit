export type AuthorizationTransaction = {
	/** Store-derived hash of the opaque transaction identifier. */
	transactionIdHash: string;
	userId: string;
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	codeChallengeMethod: string;
	state: string | null;
	issuer: string;
	resource: string;
	scope: string;
	expiresAt: Date;
	consumedAt: Date | null;
	createdAt: Date;
};

export type AuthorizationCode = {
	/** Hash of the one-time credential; plaintext authorization codes are never persisted. */
	codeHash: string;
	clientId: string;
	userId: string;
	redirectUri: string;
	codeChallenge: string;
	codeChallengeMethod: string;
	scope: string | null;
	state: string | null;
	resource: string;
	expiresAt: Date;
	usedAt: Date | null;
	createdAt: Date;
};

export type AccessToken = {
	/** Hash of the bearer credential; plaintext access tokens are never persisted. */
	accessTokenHash: string;
	clientId: string;
	userId: string;
	scope: string | null;
	resource: string;
	expiresAt: Date;
	revokedAt: Date | null;
	createdAt: Date;
};

export type RefreshToken = {
	/** Hash of the bearer credential; plaintext refresh tokens are never persisted. */
	refreshTokenHash: string;
	clientId: string;
	userId: string;
	scope: string | null;
	resource: string;
	accessTokenHash: string;
	familyId: string;
	expiresAt: Date;
	revokedAt: Date | null;
	createdAt: Date;
};

export type RegisteredClient = {
	clientId: string;
	/** Hash of the client credential; null for public clients. */
	clientSecretHash: string | null;
	clientName: string;
	clientType: string;
	tokenEndpointAuthMethod: string;
	applicationType: string | null;
	redirectUris: string[];
	grantTypes: string[];
	responseTypes: string[];
	clientIdMetadataUrl: string | null;
	/** Null preserves the legacy meaning that no client-secret expiry is enforced. */
	clientSecretExpiresAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

export type ConsumedAuthorizationTransaction = AuthorizationTransaction & { consumedAt: Date };

export type ConsumedAuthorizationCode = AuthorizationCode & { usedAt: Date };

export interface TransactionStore {
	/**
	 * Persists hashes of both plaintext secrets using one store-owned hashing
	 * scheme. The plaintext values must never be retained in the record.
	 */
	create(input: {
		record: Omit<AuthorizationTransaction, 'transactionIdHash'>;
		transactionId: string;
		csrfToken: string;
		consentBinding: string;
	}): Promise<void>;
	/**
	 * Atomically consumes a live, unused transaction matching the transaction
	 * identifier, CSRF token, durable subject, and identity binding. The implementation must
	 * enforce every predicate in one operation; read-then-write stores are
	 * non-conforming because concurrent approvals could both succeed.
	 */
	consume(
		transactionId: string,
		csrfToken: string,
		binding: string,
		subjectId: string,
	): Promise<ConsumedAuthorizationTransaction | null>;
	/** Reopens only the exact consumption returned by `consume`. */
	unconsume(transactionId: string, consumedAt: Date): Promise<boolean>;
	/**
	 * Deletes every transaction whose opaque consent binding equals `value`.
	 * The store compares the value for equality and must never parse or infer
	 * identity granularity from it.
	 */
	deleteByBinding(value: string): Promise<number>;
	/** Deletes every authorization transaction attributed to the durable subject. */
	deleteAllForUser(userId: string): Promise<number>;
	purgeExpired(now: Date): Promise<number>;
}

export interface CodeStore {
	/** Persists an authorization-code record containing only the code hash. */
	issue(record: AuthorizationCode): Promise<void>;
	/** Reads validation predicates by hash without spending the code. */
	findByHash(codeHash: string): Promise<AuthorizationCode | null>;
	/**
	 * Atomically consumes an unused code whose expiry is later than `now`. A
	 * second consume call for the same hash, or a call at or after expiry,
	 * returns null.
	 */
	consume(codeHash: string, now: Date): Promise<ConsumedAuthorizationCode | null>;
	/** Reopens only the exact consumption returned by `consume`. */
	unconsume(codeHash: string, usedAt: Date): Promise<boolean>;
	/** Deletes every authorization code attributed to the durable subject. */
	deleteAllForUser(userId: string): Promise<number>;
	purgeExpired(now: Date): Promise<number>;
}

export type RefreshTokenRevocationTarget = {
	/** Subject whose live MCP streams must be disconnected after revocation. */
	userId: string;
	/** Token family whose replay was detected or whose grant was revoked. */
	familyId: string;
};

export interface TokenStore {
	/** Atomically persists the hashed access token and optional hashed root refresh token. */
	issueAuthorizationGrant(input: {
		accessToken: AccessToken;
		refreshToken?: RefreshToken;
	}): Promise<void>;
	findByHash(tokenHash: string): Promise<AccessToken | null>;
	/**
	 * Loads and validates the prior opaque token, then derives subject, scope,
	 * resource, and family fields for both replacements inside one operation.
	 * Successful rotation also revokes the access token paired with the prior
	 * refresh token before returning the replacement credentials.
	 * A requested scope must be a subset of the stored grant and is rejected
	 * without consuming the prior token otherwise. Replaying an already-rotated
	 * token atomically revokes its family before returning `replay_revoked`.
	 */
	rotateRefreshToken(input: {
		priorHash: string;
		clientId: string;
		resource: string;
		/** Optional normalized scope request; the store rejects any non-subset. */
		requestedScope?: string;
		nextAccessTokenHash: string;
		nextRefreshTokenHash: string;
		accessTokenExpiresAt: Date;
		refreshTokenExpiresAt: Date;
		createdAt: Date;
	}): Promise<
		| { status: 'rotated'; accessToken: AccessToken; refreshToken: RefreshToken }
		| ({ status: 'replay_revoked' } & RefreshTokenRevocationTarget)
		| { status: 'scope_rejected' }
		| { status: 'invalid' }
	>;
	/** Revokes a client-owned access token and its paired refresh token, if any. */
	revokeAccessToken(tokenHash: string, clientId: string): Promise<boolean>;
	/**
	 * Revokes a client-owned refresh token and its paired access token. Replaying
	 * a rotated token atomically revokes its family and returns `replay_revoked`.
	 */
	revokeRefreshToken(
		tokenHash: string,
		clientId: string,
	): Promise<
		| ({ status: 'revoked' | 'replay_revoked' } & RefreshTokenRevocationTarget)
		| { status: 'invalid' }
	>;
	/**
	 * Revokes the refresh-token family and all access tokens descended from it
	 * in one atomic statement or an equivalently non-interleavable operation.
	 */
	revokeFamily(familyId: string): Promise<number>;
	/** Deletes every access and refresh token attributed to the durable subject. */
	deleteAllForUser(userId: string): Promise<number>;
	/**
	 * Deletes expired access tokens and refresh tokens whose `expiresAt` is at
	 * or before `now`. A rotated refresh token remains observable until its own
	 * expiry so presenting it again can still trigger family replay revocation;
	 * rotation alone never makes a refresh token eligible for this purge.
	 */
	purgeExpired(now: Date): Promise<number>;
}

/**
 * Client registrations are not user-owned and therefore have no
 * `deleteAllForUser` operation. Secret expiry is enforced when the client
 * authenticates; deleting the registration would prevent secret rotation.
 */
export interface ClientStore {
	register(record: RegisteredClient): Promise<void>;
	/** Atomically creates or replaces a client sourced from refreshed metadata. */
	upsert(record: RegisteredClient): Promise<void>;
	findById(clientId: string): Promise<RegisteredClient | null>;
	update(clientId: string, patch: Partial<RegisteredClient>): Promise<void>;
}

export type OAuthUserDeletionResult = {
	transactions: number;
	codes: number;
	tokens: number;
};

export type OAuthStores = {
	transactions: TransactionStore;
	codes: CodeStore;
	tokens: TokenStore;
	clients: ClientStore;
	/**
	 * Deletes all user-owned OAuth state across the transaction, code, and token
	 * stores. A Postgres adapter may satisfy this through referential cascade;
	 * a backing store without referential integrity must explicitly fan out to
	 * all three stores.
	 */
	deleteAllForUser(userId: string): Promise<OAuthUserDeletionResult>;
};
