import { environment } from '@web/env';
import { isRedisConfigured } from '@web/lib/redis-client';

/**
 * Fail-closed production startup checks. Called once from `server.ts`
 * before `Bun.serve` accepts any traffic. Deliberately narrow to what
 * SEC-003 owns today (the shared atomic rate limiter); CONFIG-001 and
 * DX-001 are expected to extend this with the rest of production's
 * fail-closed invariants rather than defining a second, parallel list.
 */
export function assertProductionStartupInvariants(): void {
	if (environment.NODE_ENV !== 'production') return;

	const failures: string[] = [];

	if (!isRedisConfigured()) {
		failures.push(
			'REDIS_URL is not set. Production must use the shared, atomic Redis-backed rate limiter — ' +
				'the in-memory fallback is per-process and does not protect a multi-instance deployment.',
		);
	}

	if (failures.length > 0) {
		throw new Error(`Refusing to start in production:\n- ${failures.join('\n- ')}`);
	}
}
