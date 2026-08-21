import { describe, it, expect } from 'bun:test';
import { createTestContext } from '../testing/context';
import { getUserProfileTool } from './get-user-profile';

describe('getUserProfileTool', () => {
	it('has the expected name', () => {
		expect(getUserProfileTool.name).toBe('get_user_profile');
	});

	it('has a title', () => {
		expect(getUserProfileTool.title).toBeTruthy();
	});

	it('has a description', () => {
		expect(getUserProfileTool.description).toBeTruthy();
	});

	it('has an inputSchema', () => {
		expect(getUserProfileTool.inputSchema).toBeDefined();
	});

	it('has an outputSchema', () => {
		expect(getUserProfileTool.outputSchema).toBeDefined();
	});

	it('has accurate safety annotations', () => {
		expect(getUserProfileTool.annotations).toEqual({
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		});
	});

	it('has a handler function', () => {
		expect(typeof getUserProfileTool.handler).toBe('function');
	});

	it('returns structuredContent matching the declared output schema', async () => {
		const context = createTestContext();
		const result = await getUserProfileTool.handler({}, context);

		expect(result.isError).not.toBe(true);
		expect(result.structuredContent).toMatchObject({
			id: context.user.id,
			name: context.user.name,
			email: context.user.email,
			image: context.user.image,
		});

		const parsed = getUserProfileTool.outputSchema!.safeParse(result.structuredContent);
		expect(parsed.success).toBe(true);
	});

	it('includes a human-readable text summary distinct from the structured payload', async () => {
		const context = createTestContext();
		const result = await getUserProfileTool.handler({}, context);

		expect(result.content[0]?.type).toBe('text');
		expect(result.content[0]?.text).toContain(context.user.name);
		expect(() => JSON.parse(result.content[0]!.text!)).toThrow();
	});
});
