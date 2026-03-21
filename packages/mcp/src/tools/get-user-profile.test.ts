import { describe, it, expect, mock } from 'bun:test';
import { createTestContext } from '../testing/context';
import { expectToolError, expectToolJsonContent } from '../testing/tool-assertions';

const mockUser = {
	id: 'test-user-00000000-0000-0000-0000-000000000000',
	name: 'Test User',
	email: 'test@example.com',
	image: 'https://example.com/avatar.png',
};

function createMockDatabase(users: Array<typeof mockUser>) {
	return {
		database: {
			select: () => ({
				from: () => ({
					where: () => ({
						limit: () => Promise.resolve(users),
					}),
				}),
			}),
		},
		schema: {
			users: { id: 'id' },
		},
	};
}

mock.module('@template/database', () => createMockDatabase([mockUser]));
mock.module('drizzle-orm', () => ({
	eq: (column: unknown, value: unknown) => ({ column, value }),
}));

const { getUserProfileTool } = await import('./get-user-profile');

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

	it('returns user profile on success', async () => {
		const context = createTestContext();
		const result = await getUserProfileTool.handler({}, context);
		const parsed = expectToolJsonContent(result);
		expect(parsed).toMatchObject({
			id: mockUser.id,
			name: mockUser.name,
			email: mockUser.email,
			image: mockUser.image,
		});
	});
});

describe('getUserProfileTool — user not found', () => {
	it('returns error when user does not exist', async () => {
		mock.module('@template/database', () => createMockDatabase([]));
		const { getUserProfileTool: freshTool } = await import('./get-user-profile');
		const context = createTestContext();
		const result = await freshTool.handler({}, context);
		expectToolError(result);
		expect(result.content[0].text).toContain('User not found');
	});
});

describe('getUserProfileTool — database error', () => {
	it('returns error when database throws', async () => {
		mock.module('@template/database', () => ({
			database: {
				select: () => ({
					from: () => ({
						where: () => ({
							limit: () => Promise.reject(new Error('connection refused')),
						}),
					}),
				}),
			},
			schema: {
				users: { id: 'id' },
			},
		}));
		const { getUserProfileTool: freshTool } = await import('./get-user-profile');
		const context = createTestContext();
		const result = await freshTool.handler({}, context);
		expectToolError(result);
		expect(result.content[0].text).toContain('Failed to retrieve');
	});
});
