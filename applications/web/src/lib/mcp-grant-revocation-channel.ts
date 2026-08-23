import { logger } from '@template/mcp/logger';
import { getRedisClient, getRedisSubscriberClient, isRedisConfigured } from '@web/lib/redis-client';

/**
 * Round 17 review finding (P2): revoking a grant was a database-only
 * operation, so a `subscriptions/listen` stream opened before the revoke
 * kept receiving events — bearer authentication is checked when the stream
 * opens and never again — and its nonzero listener count also kept the
 * handler pinned against idle eviction. Revocation now ends live access,
 * not merely future access.
 *
 * Closing the local `McpUserHandlerCache` entry is not sufficient on its
 * own, for the same reason that cache documents deliberately:
 * `RedisUserServerEventBus` fans out over Redis, so the open stream may be
 * held by a different instance than the one processing the revocation. A
 * local-only close would leave the reported scenario intact whenever those
 * two instances differ.
 *
 * So this module owns a dedicated control channel. It is deliberately its
 * OWN channel rather than a new event `kind` on the per-user resource
 * channel: that bus hands every deserialized event straight to the SDK's
 * listen router, and what the router does with an unrecognized `kind` is
 * the SDK's behavior to define, not this codebase's.
 *
 * It is also deliberately the only thing the revocation path imports.
 * Importing `mcp-handler.ts` directly would drag its module-initialization
 * side effects (the idle sweep timer, the Redis subscription) into every
 * consumer of `consent-inventory.ts`, including tests that never touch MCP.
 * This module has no import-time side effects of its own.
 */
const grantRevocationChannel = 'mcp:control:grant-revocations';

type LocalHandlerCloser = (userId: string) => void | Promise<unknown>;

const localHandlerClosers = new Set<LocalHandlerCloser>();

/**
 * The Redis subscription is per process, not per registered closer. Calling
 * `subscriber.subscribe` again for the same channel adds a SECOND listener,
 * so every announcement would then run the closer set once per call —
 * harmless in production, where module initialization calls this exactly
 * once, but it makes the behavior depend on how many times this module has
 * been wired up rather than on what was announced.
 */
let redisSubscriptionStarted = false;

function runLocalClosers(userId: string): void {
	for (const close of localHandlerClosers) {
		void Promise.resolve(close(userId)).catch((error: unknown) => {
			logger.error({ err: error, userId }, 'Failed to close revoked MCP user handler');
		});
	}
}

/**
 * Announces that every live MCP handler for this user must be closed.
 *
 * Call this AFTER the revoking write commits: a client reconnecting between
 * a premature close and the write would re-authenticate successfully
 * against rows that are still live.
 *
 * When Redis is configured the announcement goes over the channel and
 * reaches every instance — including this one, whose own subscriber is a
 * separate connection and receives its own publish. Without Redis there is
 * exactly one process, so the registered local closers are invoked
 * directly. Awaiting the returned promise guarantees the publish command
 * was issued, not that remote instances have finished closing.
 */
export async function publishGrantRevocation(userId: string): Promise<void> {
	if (!isRedisConfigured()) {
		runLocalClosers(userId);
		return;
	}
	try {
		const client = await getRedisClient();
		await client.publish(grantRevocationChannel, JSON.stringify({ userId }));
	} catch (error) {
		logger.error({ err: error, userId }, 'Failed to publish MCP grant revocation');
		// Fail closed locally rather than leaving this instance's own stream
		// open because the announcement could not be sent.
		runLocalClosers(userId);
	}
}

function readUserId(message: string): string | undefined {
	try {
		const parsed: unknown = JSON.parse(message);
		if (typeof parsed !== 'object' || parsed === null) return undefined;
		const userId = (parsed as { userId?: unknown }).userId;
		return typeof userId === 'string' && userId.length > 0 ? userId : undefined;
	} catch (error) {
		logger.error({ err: error }, 'Failed to parse MCP grant revocation payload');
		return undefined;
	}
}

/**
 * Registers this instance's handler-closing callback and, when Redis is
 * configured, subscribes to announcements from every other instance.
 * Called once at module initialization from `mcp-handler.ts`.
 */
export function subscribeToGrantRevocations(closeUserHandler: LocalHandlerCloser): void {
	localHandlerClosers.add(closeUserHandler);
	if (!isRedisConfigured() || redisSubscriptionStarted) return;
	redisSubscriptionStarted = true;
	void getRedisSubscriberClient()
		.then((subscriber) =>
			subscriber.subscribe(grantRevocationChannel, (message) => {
				const userId = readUserId(message);
				if (userId) runLocalClosers(userId);
			}),
		)
		.catch((error: unknown) => {
			redisSubscriptionStarted = false;
			logger.error({ err: error }, 'Failed to subscribe to the MCP grant revocation channel');
		});
}

/** Test seam: the registry is process-global and shared across test files. */
export const grantRevocationTestHooks = {
	channelName: grantRevocationChannel,
	registerLocalCloser(close: LocalHandlerCloser): () => void {
		localHandlerClosers.add(close);
		return () => localHandlerClosers.delete(close);
	},
	reset(): void {
		localHandlerClosers.clear();
	},
};
