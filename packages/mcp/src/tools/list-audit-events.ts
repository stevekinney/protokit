import { z } from 'zod';
import { createToolTextResponse } from '../tool-response.js';
import { defineTool } from '../scopes.js';

const auditEvents = Array.from({ length: 50 }, (_, index) => ({
	identifier: `event-${String(index + 1).padStart(3, '0')}`,
	message: `Audit event #${index + 1}`,
}));

const listAuditEventsOutputSchema = z.object({
	items: z.array(
		z.object({
			identifier: z.string(),
			message: z.string(),
		}),
	),
	next_cursor: z.string().nullable(),
});

function decodeCursor(cursor: string | undefined): number {
	if (!cursor) return 0;
	const parsed = Number.parseInt(cursor, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export const listAuditEventsTool = defineTool({
	name: 'list_audit_events',
	title: 'List Audit Events (Conformance Fixture)',
	description:
		'Returns deterministic, cursor-paginated synthetic audit events. This is a protocol conformance fixture for exercising pagination flows, not a real audit log — the data is generated in memory and never reflects actual account activity.',
	inputSchema: z.object({
		cursor: z
			.string()
			.optional()
			.describe(
				"Opaque pagination cursor from a previous call's next_cursor. Omit for the first page.",
			),
		page_size: z
			.number()
			.int()
			.min(1)
			.max(25)
			.optional()
			.default(10)
			.describe('Number of events to return per page (1-25, default 10).'),
	}),
	outputSchema: listAuditEventsOutputSchema,
	requiredScope: 'audit:read',
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	handler: async (input) => {
		const start = decodeCursor(input.cursor);
		const end = Math.min(start + input.page_size, auditEvents.length);
		const nextCursor = end < auditEvents.length ? String(end) : null;

		return {
			...createToolTextResponse(`Returned ${end - start} audit events.`),
			structuredContent: {
				items: auditEvents.slice(start, end),
				next_cursor: nextCursor,
			},
		};
	},
});
