import { createHash } from 'node:crypto';

import type {
	AccessToken,
	AuthorizationCode,
	AuthorizationTransaction,
	ClientStore,
	CodeStore,
	ConsumedAuthorizationCode,
	ConsumedAuthorizationTransaction,
	OAuthStores,
	OAuthUserDeletionResult,
	RefreshToken,
	RegisteredClient,
	TokenStore,
	TransactionStore,
} from '../stores.js';

function hash(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function cloneDate(date: Date): Date {
	return new Date(date);
}

function cloneTransaction(record: AuthorizationTransaction): AuthorizationTransaction {
	return {
		...record,
		expiresAt: cloneDate(record.expiresAt),
		consumedAt: record.consumedAt && cloneDate(record.consumedAt),
		createdAt: cloneDate(record.createdAt),
	};
}

function cloneCode(record: AuthorizationCode): AuthorizationCode {
	return {
		...record,
		expiresAt: cloneDate(record.expiresAt),
		usedAt: record.usedAt && cloneDate(record.usedAt),
		createdAt: cloneDate(record.createdAt),
	};
}

function cloneAccessToken(record: AccessToken): AccessToken {
	return {
		...record,
		expiresAt: cloneDate(record.expiresAt),
		revokedAt: record.revokedAt && cloneDate(record.revokedAt),
		createdAt: cloneDate(record.createdAt),
	};
}

function cloneRefreshToken(record: RefreshToken): RefreshToken {
	return {
		...record,
		expiresAt: cloneDate(record.expiresAt),
		revokedAt: record.revokedAt && cloneDate(record.revokedAt),
		createdAt: cloneDate(record.createdAt),
	};
}

export class InMemoryTransactionStore implements TransactionStore {
	readonly #records = new Map<
		string,
		{ record: AuthorizationTransaction; csrfTokenHash: string; consentBinding: string }
	>();

	create(input: {
		record: Omit<AuthorizationTransaction, 'transactionIdHash'>;
		transactionId: string;
		csrfToken: string;
		consentBinding: string;
	}): Promise<void> {
		const transactionIdHash = hash(input.transactionId);
		this.#records.set(transactionIdHash, {
			record: cloneTransaction({ ...input.record, transactionIdHash }),
			csrfTokenHash: hash(input.csrfToken),
			consentBinding: input.consentBinding,
		});
		return Promise.resolve();
	}

	consume(
		transactionId: string,
		csrfToken: string,
		binding: string,
	): Promise<ConsumedAuthorizationTransaction | null> {
		const entry = this.#records.get(hash(transactionId));
		const now = new Date();
		if (
			!entry ||
			entry.record.consumedAt ||
			entry.record.expiresAt <= now ||
			entry.csrfTokenHash !== hash(csrfToken) ||
			entry.consentBinding !== binding
		)
			return Promise.resolve(null);
		entry.record.consumedAt = now;
		return Promise.resolve(cloneTransaction(entry.record) as ConsumedAuthorizationTransaction);
	}

	unconsume(transactionId: string, consumedAt: Date): Promise<boolean> {
		const entry = this.#records.get(hash(transactionId));
		if (!entry?.record.consumedAt || entry.record.consumedAt.getTime() !== consumedAt.getTime())
			return Promise.resolve(false);
		entry.record.consumedAt = null;
		return Promise.resolve(true);
	}

	deleteByBinding(value: string): Promise<number> {
		return Promise.resolve(this.#deleteWhere((entry) => entry.consentBinding === value));
	}
	deleteAllForUser(userId: string): Promise<number> {
		return Promise.resolve(this.#deleteWhere((entry) => entry.record.userId === userId));
	}
	purgeExpired(now: Date): Promise<number> {
		return Promise.resolve(this.#deleteWhere((entry) => entry.record.expiresAt <= now));
	}

	#deleteWhere(
		predicate: (entry: { record: AuthorizationTransaction; consentBinding: string }) => boolean,
	): number {
		let deleted = 0;
		for (const [key, entry] of this.#records)
			if (predicate(entry)) {
				this.#records.delete(key);
				deleted += 1;
			}
		return deleted;
	}
}

export class InMemoryCodeStore implements CodeStore {
	readonly #records = new Map<string, AuthorizationCode>();
	issue(record: AuthorizationCode): Promise<void> {
		this.#records.set(record.codeHash, cloneCode(record));
		return Promise.resolve();
	}
	findByHash(codeHash: string): Promise<AuthorizationCode | null> {
		const record = this.#records.get(codeHash);
		return Promise.resolve(record ? cloneCode(record) : null);
	}
	consume(codeHash: string, now: Date): Promise<ConsumedAuthorizationCode | null> {
		const record = this.#records.get(codeHash);
		if (!record || record.usedAt || record.expiresAt <= now) return Promise.resolve(null);
		record.usedAt = cloneDate(now);
		return Promise.resolve(cloneCode(record) as ConsumedAuthorizationCode);
	}
	unconsume(codeHash: string, usedAt: Date): Promise<boolean> {
		const record = this.#records.get(codeHash);
		if (!record?.usedAt || record.usedAt.getTime() !== usedAt.getTime())
			return Promise.resolve(false);
		record.usedAt = null;
		return Promise.resolve(true);
	}
	deleteAllForUser(userId: string): Promise<number> {
		return Promise.resolve(this.#deleteWhere((record) => record.userId === userId));
	}
	purgeExpired(now: Date): Promise<number> {
		return Promise.resolve(this.#deleteWhere((record) => record.expiresAt <= now));
	}
	#deleteWhere(predicate: (record: AuthorizationCode) => boolean): number {
		let deleted = 0;
		for (const [key, record] of this.#records)
			if (predicate(record)) {
				this.#records.delete(key);
				deleted += 1;
			}
		return deleted;
	}
}

export class InMemoryTokenStore implements TokenStore {
	readonly #accessTokens = new Map<string, AccessToken>();
	readonly #refreshTokens = new Map<string, RefreshToken>();

	issueAuthorizationGrant(input: {
		accessToken: AccessToken;
		refreshToken?: RefreshToken;
	}): Promise<void> {
		this.#accessTokens.set(input.accessToken.accessTokenHash, cloneAccessToken(input.accessToken));
		if (input.refreshToken)
			this.#refreshTokens.set(
				input.refreshToken.refreshTokenHash,
				cloneRefreshToken(input.refreshToken),
			);
		return Promise.resolve();
	}
	findByHash(tokenHash: string): Promise<AccessToken | null> {
		const record = this.#accessTokens.get(tokenHash);
		return Promise.resolve(record ? cloneAccessToken(record) : null);
	}
	rotateRefreshToken(input: {
		priorHash: string;
		clientId: string;
		resource: string;
		requestedScope?: string;
		nextAccessTokenHash: string;
		nextRefreshTokenHash: string;
		accessTokenExpiresAt: Date;
		refreshTokenExpiresAt: Date;
		createdAt: Date;
	}): ReturnType<TokenStore['rotateRefreshToken']> {
		const prior = this.#refreshTokens.get(input.priorHash);
		if (
			!prior ||
			prior.clientId !== input.clientId ||
			prior.resource !== input.resource ||
			prior.expiresAt <= input.createdAt
		)
			return Promise.resolve({ status: 'invalid' });
		if (prior.revokedAt) {
			this.#revokeFamily(prior.familyId, input.createdAt);
			return Promise.resolve({ status: 'replay_revoked', userId: prior.userId });
		}
		if (input.requestedScope && !isScopeSubset(input.requestedScope, prior.scope))
			return Promise.resolve({ status: 'scope_rejected' });
		prior.revokedAt = cloneDate(input.createdAt);
		const pairedAccessToken = this.#accessTokens.get(prior.accessTokenHash);
		if (pairedAccessToken) pairedAccessToken.revokedAt = cloneDate(input.createdAt);
		const scope = input.requestedScope ?? prior.scope;
		const accessToken: AccessToken = {
			accessTokenHash: input.nextAccessTokenHash,
			clientId: prior.clientId,
			userId: prior.userId,
			scope,
			resource: prior.resource,
			expiresAt: cloneDate(input.accessTokenExpiresAt),
			revokedAt: null,
			createdAt: cloneDate(input.createdAt),
		};
		const refreshToken: RefreshToken = {
			refreshTokenHash: input.nextRefreshTokenHash,
			clientId: prior.clientId,
			userId: prior.userId,
			scope,
			resource: prior.resource,
			accessTokenHash: accessToken.accessTokenHash,
			familyId: prior.familyId,
			expiresAt: cloneDate(input.refreshTokenExpiresAt),
			revokedAt: null,
			createdAt: cloneDate(input.createdAt),
		};
		this.#accessTokens.set(accessToken.accessTokenHash, accessToken);
		this.#refreshTokens.set(refreshToken.refreshTokenHash, refreshToken);
		return Promise.resolve({
			status: 'rotated',
			accessToken: cloneAccessToken(accessToken),
			refreshToken: cloneRefreshToken(refreshToken),
		});
	}
	revokeAccessToken(tokenHash: string, clientId: string): Promise<boolean> {
		const token = this.#accessTokens.get(tokenHash);
		if (!token || token.clientId !== clientId) return Promise.resolve(false);
		const now = new Date();
		token.revokedAt ??= now;
		for (const refresh of this.#refreshTokens.values())
			if (refresh.accessTokenHash === tokenHash) refresh.revokedAt ??= now;
		return Promise.resolve(true);
	}
	revokeRefreshToken(
		tokenHash: string,
		clientId: string,
	): ReturnType<TokenStore['revokeRefreshToken']> {
		const token = this.#refreshTokens.get(tokenHash);
		if (!token || token.clientId !== clientId) return Promise.resolve({ status: 'invalid' });
		const now = new Date();
		if (token.revokedAt) {
			this.#revokeFamily(token.familyId, now);
			return Promise.resolve({ status: 'replay_revoked', userId: token.userId });
		}
		token.revokedAt = now;
		const access = this.#accessTokens.get(token.accessTokenHash);
		if (access) access.revokedAt ??= now;
		return Promise.resolve({ status: 'revoked', userId: token.userId });
	}
	revokeFamily(familyId: string): Promise<number> {
		return Promise.resolve(this.#revokeFamily(familyId, new Date()));
	}
	deleteAllForUser(userId: string): Promise<number> {
		let deleted = 0;
		for (const [key, token] of this.#accessTokens)
			if (token.userId === userId) {
				this.#accessTokens.delete(key);
				deleted += 1;
			}
		for (const [key, token] of this.#refreshTokens)
			if (token.userId === userId) {
				this.#refreshTokens.delete(key);
				deleted += 1;
			}
		return Promise.resolve(deleted);
	}
	purgeExpired(now: Date): Promise<number> {
		let deleted = 0;
		for (const [key, token] of this.#accessTokens)
			if (token.expiresAt <= now) {
				this.#accessTokens.delete(key);
				deleted += 1;
			}
		for (const [key, token] of this.#refreshTokens)
			if (token.expiresAt <= now) {
				this.#refreshTokens.delete(key);
				deleted += 1;
			}
		return Promise.resolve(deleted);
	}
	#revokeFamily(familyId: string, now: Date): number {
		let revoked = 0;
		const accessHashes = new Set<string>();
		for (const token of this.#refreshTokens.values())
			if (token.familyId === familyId) {
				if (!token.revokedAt) {
					token.revokedAt = cloneDate(now);
					revoked += 1;
				}
				accessHashes.add(token.accessTokenHash);
			}
		for (const hash of accessHashes) {
			const token = this.#accessTokens.get(hash);
			if (token && !token.revokedAt) {
				token.revokedAt = cloneDate(now);
				revoked += 1;
			}
		}
		return revoked;
	}
}

function isScopeSubset(requested: string, granted: string | null): boolean {
	const grantedScopes = new Set((granted ?? '').split(/\s+/).filter(Boolean));
	return requested
		.split(/\s+/)
		.filter(Boolean)
		.every((scope) => grantedScopes.has(scope));
}

export class InMemoryClientStore implements ClientStore {
	readonly #records = new Map<string, RegisteredClient>();
	register(record: RegisteredClient): Promise<void> {
		if (this.#records.has(record.clientId))
			return Promise.reject(new Error(`Client already registered: ${record.clientId}`));
		this.#records.set(record.clientId, structuredClone(record));
		return Promise.resolve();
	}
	upsert(record: RegisteredClient): Promise<void> {
		this.#records.set(record.clientId, structuredClone(record));
		return Promise.resolve();
	}
	findById(clientId: string): Promise<RegisteredClient | null> {
		const record = this.#records.get(clientId);
		return Promise.resolve(record ? structuredClone(record) : null);
	}
	update(clientId: string, patch: Partial<RegisteredClient>): Promise<void> {
		const record = this.#records.get(clientId);
		if (!record) return Promise.resolve();
		this.#records.set(clientId, structuredClone({ ...record, ...patch, clientId }));
		return Promise.resolve();
	}
}

export function createInMemoryOAuthStores(): OAuthStores {
	const transactions = new InMemoryTransactionStore();
	const codes = new InMemoryCodeStore();
	const tokens = new InMemoryTokenStore();
	const clients = new InMemoryClientStore();
	return {
		transactions,
		codes,
		tokens,
		clients,
		async deleteAllForUser(userId: string): Promise<OAuthUserDeletionResult> {
			const [transactionCount, codeCount, tokenCount] = await Promise.all([
				transactions.deleteAllForUser(userId),
				codes.deleteAllForUser(userId),
				tokens.deleteAllForUser(userId),
			]);
			return { transactions: transactionCount, codes: codeCount, tokens: tokenCount };
		},
	};
}
