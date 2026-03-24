import { describe, it, expect } from 'bun:test';
import { createTestContext } from '../testing/context';
import { expectToolJsonContent } from '../testing/tool-assertions';
import { getUserProfileTool } from './get-user-profile';

describe('getUserProfileTool', () => {
	it('has the expected name', () => {
		expect(getUserProfileTool.name).toBe('get_user_profile');
	});

	it('has a description', () => {
		expect(getUserProfileTool.description).toBeTruthy();
	});

	it('has an inputSchema', () => {
		expect(getUserProfileTool.inputSchema).toBeDefined();
	});

	it('has a handler function', () => {
		expect(typeof getUserProfileTool.handler).toBe('function');
	});

	it('returns user profile from context', async () => {
		const context = createTestContext();
		const result = await getUserProfileTool.handler({}, context);
		const parsed = expectToolJsonContent(result);
		expect(parsed).toMatchObject({
			id: context.user.id,
			name: context.user.name,
			email: context.user.email,
			image: context.user.image,
		});
	});
});
