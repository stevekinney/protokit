export type AuthorizationTransaction = {
	transactionId: string;
	csrfTokenHash: string;
	userId: string;
	sessionTokenHash: string;
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
	code: string;
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
	accessToken: string;
	clientId: string;
	userId: string;
	scope: string | null;
	resource: string;
	expiresAt: Date;
	revokedAt: Date | null;
	createdAt: Date;
};

export type RefreshToken = {
	refreshToken: string;
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
	clientSecret: string | null;
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

export interface TransactionStore {
	create(record: AuthorizationTransaction): Promise<void>;
	/**
	 * Atomically consumes a live, unused transaction matching the transaction
	 * identifier, CSRF token, and identity binding. The implementation must
	 * enforce every predicate in one operation; read-then-write stores are
	 * non-conforming because concurrent approvals could both succeed.
	 */
	consume(
		transactionId: string,
		csrfToken: string,
		binding: string,
	): Promise<AuthorizationTransaction | null>;
	/** Reopens only the exact consumption returned by `consume`. */
	unconsume(transactionId: string, consumedAt: Date): Promise<boolean>;
	purgeExpired(now: Date): Promise<number>;
}

export interface CodeStore {
	issue(record: AuthorizationCode): Promise<void>;
	/** Reads validation predicates without spending the code. */
	findByCode(code: string): Promise<AuthorizationCode | null>;
	/** A second consume call for the same code returns null. */
	consume(code: string): Promise<AuthorizationCode | null>;
	/** Reopens only the exact consumption returned by `consume`. */
	unconsume(code: string, usedAt: Date): Promise<boolean>;
	purgeExpired(now: Date): Promise<number>;
}

export type RefreshTokenRevocationTarget = {
	/** Subject whose live MCP streams must be disconnected after revocation. */
	userId: string;
};

export interface TokenStore {
	/** Atomically persists the access token and optional root refresh token. */
	issueAuthorizationGrant(input: {
		accessToken: AccessToken;
		refreshToken?: RefreshToken;
	}): Promise<void>;
	findByHash(tokenHash: string): Promise<AccessToken | null>;
	/**
	 * Loads and validates the prior opaque token, then derives subject, scope,
	 * resource, and family fields for both replacements inside one operation.
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
	purgeExpired(now: Date): Promise<number>;
}

export interface ClientStore {
	register(record: RegisteredClient): Promise<void>;
	/** Atomically creates or replaces a client sourced from refreshed metadata. */
	upsert(record: RegisteredClient): Promise<void>;
	findById(clientId: string): Promise<RegisteredClient | null>;
	update(clientId: string, patch: Partial<RegisteredClient>): Promise<void>;
}

export type OAuthStores = {
	transactions: TransactionStore;
	codes: CodeStore;
	tokens: TokenStore;
	clients: ClientStore;
};
