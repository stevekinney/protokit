import { z } from 'zod';

const auditEvents = Array.from({ length: 50 }, (_, index) => ({
	identifier: `event-${String(index + 1).padStart(3, '0')}`,
	message: `Audit event #${index + 1}`,
}));

function decodeCursor(cursor: string | undefined): number {
	if (!cursor) return 0;
	const parsed = Number.parseInt(cursor, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export const listAuditEventsTool = {
	name: 'list_audit_events' as const,
	description: 'Returns deterministic, cursor-paginated audit events for testing pagination flows.',
	inputSchema: z.object({
		cursor: z.string().optional(),
		page_size: z.number().int().min(1).max(25).optional().default(10),
	}),
	handler: async (input: { cursor?: string; page_size: number }) => {
		const start = decodeCursor(input.cursor);
		const end = Math.min(start + input.page_size, auditEvents.length);
		const nextCursor = end < auditEvents.length ? String(end) : null;

		return {
			content: [
				{
					type: 'text' as const,
					text: `Returned ${end - start} audit events.`,
				},
			],
			structuredContent: {
				items: auditEvents.slice(start, end),
				next_cursor: nextCursor,
			},
		};
	},
};
