import { describe, it, expect } from 'bun:test';
import { listAuditEventsTool } from './list-audit-events';

describe('listAuditEventsTool', () => {
	it('has the expected name', () => {
		expect(listAuditEventsTool.name).toBe('list_audit_events');
	});

	it('has a description', () => {
		expect(listAuditEventsTool.description).toBeTruthy();
	});

	it('has an inputSchema', () => {
		expect(listAuditEventsTool.inputSchema).toBeDefined();
	});

	it('has a handler function', () => {
		expect(typeof listAuditEventsTool.handler).toBe('function');
	});

	it('returns default pagination with 10 items', async () => {
		const result = await listAuditEventsTool.handler({ page_size: 10 });
		expect(result.content[0].text).toContain('10 audit events');
		expect(result.structuredContent.items).toHaveLength(10);
		expect(result.structuredContent.next_cursor).toBe('10');
	});

	it('respects custom page size', async () => {
		const result = await listAuditEventsTool.handler({ page_size: 5 });
		expect(result.structuredContent.items).toHaveLength(5);
		expect(result.structuredContent.next_cursor).toBe('5');
	});

	it('supports cursor navigation', async () => {
		const result = await listAuditEventsTool.handler({ cursor: '10', page_size: 10 });
		expect(result.structuredContent.items).toHaveLength(10);
		expect(result.structuredContent.items[0].identifier).toBe('event-011');
		expect(result.structuredContent.next_cursor).toBe('20');
	});

	it('returns null next_cursor on last page', async () => {
		const result = await listAuditEventsTool.handler({ cursor: '45', page_size: 10 });
		expect(result.structuredContent.items).toHaveLength(5);
		expect(result.structuredContent.next_cursor).toBeNull();
	});
});
