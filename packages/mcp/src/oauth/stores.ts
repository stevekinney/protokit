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
	unconsume(transactionId: string): Promise<void>;
	purgeExpired(now: Date): Promise<number>;
}

export interface CodeStore {
	issue(record: AuthorizationCode): Promise<void>;
	/** A second consume call for the same code returns null. */
	consume(code: string): Promise<AuthorizationCode | null>;
	purgeExpired(now: Date): Promise<number>;
}

export interface TokenStore {
	issue(record: AccessToken): Promise<void>;
	findByHash(tokenHash: string): Promise<AccessToken | null>;
	rotateRefreshToken(priorHash: string, next: RefreshToken): Promise<RefreshToken | null>;
	/**
	 * Revokes the refresh-token family and all access tokens descended from it
	 * in one atomic statement or an equivalently non-interleavable operation.
	 */
	revokeFamily(familyId: string): Promise<number>;
	purgeExpired(now: Date): Promise<number>;
}

export interface ClientStore {
	register(record: RegisteredClient): Promise<void>;
	findById(clientId: string): Promise<RegisteredClient | null>;
	update(clientId: string, patch: Partial<RegisteredClient>): Promise<void>;
}

export type OAuthStores = {
	transactions: TransactionStore;
	codes: CodeStore;
	tokens: TokenStore;
	clients: ClientStore;
};
