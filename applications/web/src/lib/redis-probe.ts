import { createClient } from 'redis';

import { withDeadline } from '@web/lib/with-deadline';

/**
 * `socket.connectTimeout` below only bounds establishing the TCP/TLS connection. Once Redis has
 * accepted that connection, `ping()` has no deadline of its own -- a server that accepts and then
 * stalls (mid-failover, wedged, network partition after the handshake) leaves the await open
 * indefinitely. This mirrors `redisHealthProbeTimeoutMs` in `redis-client.ts` (Round-3 review,
 * OPS-002) — same bound, same reasoning, extracted here so it applies to every caller of
 * `probeRedisUrl`, not just the live `isRedisHealthy()` singleton.
 */
export const redisProbeTimeoutMs = 2000;

/**
 * Connects to an arbitrary Redis URL and pings it, bounded end-to-end so a wedged or unreachable
 * endpoint fails fast instead of hanging the caller. Takes the URL as a parameter rather than
 * reading the live `@web/env` singleton (as `redis-client.ts`'s `isRedisHealthy` does) so it can
 * be imported by `scripts/doctor.ts`, which probes a *candidate* `REDIS_URL` that may differ from
 * — or not yet exist in — the real process environment. Importing anything from `env.ts` at
 * module load time runs `environmentalist.sync()` against the real environment immediately and throws on an
 * incomplete one; this file has no such import, for the same reason `environment-schema.ts` and
 * `production-startup-requirements.ts` were split out of `env.ts`/`startup-invariants.ts` (see
 * `DX-001`).
 */
export async function probeRedisUrl(redisUrl: string): Promise<boolean> {
	const probe = createClient({
		url: redisUrl,
		socket: {
			reconnectStrategy: false,
			connectTimeout: redisProbeTimeoutMs,
		},
	});

	try {
		await probe.connect();
		await withDeadline(probe.ping(), redisProbeTimeoutMs);
		return true;
	} catch {
		return false;
	} finally {
		// A failed `connect()` (refused, timed out, DNS failure) leaves the client already
		// closed -- `disconnect()`'s internal `destroy()` throws `ClientClosedError`
		// *synchronously* in that state rather than rejecting the promise it returns, so a
		// trailing `.catch()` alone does not catch it: the throw would propagate out of this
		// `finally` block and mask whatever `catch` above already decided. Guard on `isOpen`
		// first, matching the direct evidence from `redis`@6's client `destroy()` implementation.
		if (probe.isOpen) {
			await probe.disconnect().catch(() => {});
		}
	}
}
