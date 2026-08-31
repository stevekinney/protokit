import { createHash } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';

export type PostgresOAuthExecutor = {
	execute(query: SQL): Promise<unknown>;
};

export type PostgresOAuthDatabase = PostgresOAuthExecutor & {
	transaction<T>(callback: (transaction: PostgresOAuthExecutor) => Promise<T>): Promise<T>;
};

export function hashOpaqueValue(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

export function resultRows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
		return result.rows as T[];
	}
	return [];
}

export function affectedRows(result: unknown): number {
	if (
		result &&
		typeof result === 'object' &&
		'rowCount' in result &&
		typeof result.rowCount === 'number'
	) {
		return result.rowCount;
	}
	return resultRows(result).length;
}

export function countRows(result: unknown): number {
	const row = resultRows<{ count: string | number }>(result)[0];
	return row ? Number(row.count) : 0;
}

export { sql };
