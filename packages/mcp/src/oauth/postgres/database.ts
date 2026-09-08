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

/**
 * Coerces a driver timestamp value to a Date.
 *
 * The read paths in these stores call `database.execute(sql`…`)`, which bypasses
 * drizzle's typed column mapping. Every drizzle pg-family driver — node-postgres,
 * neon-serverless, and pglite alike — overrides the `timestamptz`/`timestamp`/
 * `date` type parser to return the raw string so that its column `mode` can do
 * the conversion, but `execute` never reaches that mapping. So these columns
 * arrive as strings even though the store types declare `Date`, and a consumer
 * calling a `Date` method on one (for example the resource-server auth building
 * `expiresAt.getTime()`, or the client-secret expiry check) throws in
 * production. A value already a `Date` (a driver without the override) passes
 * through unchanged.
 */
export function toDate(value: unknown): Date {
	return value instanceof Date ? value : new Date(value as string);
}

/** Null-safe {@link toDate} for nullable timestamp columns. */
export function toNullableDate(value: unknown): Date | null {
	return value === null || value === undefined ? null : toDate(value);
}

/**
 * Coerces the named timestamp columns on a result row to `Date` in place and
 * returns the row. `required` columns are `NOT NULL`; `nullable` columns may be
 * null. Keeps the raw-SQL read paths' declared return types honest without
 * threading a bespoke mapper through every store.
 */
export function coerceRowDates<T>(
	row: T,
	required: readonly (keyof T)[],
	nullable: readonly (keyof T)[] = [],
): T {
	const record = row as Record<string, unknown>;
	for (const key of required) record[key as string] = toDate(record[key as string]);
	for (const key of nullable) record[key as string] = toNullableDate(record[key as string]);
	return row;
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

export function columnIdentifier(column: { name: string }) {
	return sql.identifier(column.name);
}

export function qualifiedColumnIdentifier(alias: string, column: { name: string }): SQL {
	return sql`${sql.identifier(alias)}.${columnIdentifier(column)}`;
}

export { sql };
