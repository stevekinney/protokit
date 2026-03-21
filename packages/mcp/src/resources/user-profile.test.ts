import { describe, it, expect, mock } from 'bun:test';
import { createTestContext } from '../testing/context';

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

const { userProfileResource } = await import('./user-profile');

describe('userProfileResource', () => {
	it('has the expected name', () => {
		expect(userProfileResource.name).toBe('user_profile');
	});

	it('has the expected uri', () => {
		expect(userProfileResource.uri).toBe('user://profile');
	});

	it('has a description', () => {
		expect(userProfileResource.description).toBeTruthy();
	});

	it('has the expected mimeType', () => {
		expect(userProfileResource.mimeType).toBe('application/json');
	});

	it('has a handler function', () => {
		expect(typeof userProfileResource.handler).toBe('function');
	});

	it('returns user profile as JSON resource', async () => {
		const context = createTestContext();
		const result = await userProfileResource.handler(new URL('user://profile'), context);
		expect(result.contents).toHaveLength(1);
		expect(result.contents[0].mimeType).toBe('application/json');
		const parsed = JSON.parse(result.contents[0].text);
		expect(parsed).toMatchObject({
			id: mockUser.id,
			name: mockUser.name,
			email: mockUser.email,
		});
	});
});

describe('userProfileResource — user not found', () => {
	it('returns error JSON when user does not exist', async () => {
		mock.module('@template/database', () => createMockDatabase([]));
		const { userProfileResource: freshResource } = await import('./user-profile');
		const context = createTestContext();
		const result = await freshResource.handler(new URL('user://profile'), context);
		expect(result.contents).toHaveLength(1);
		const parsed = JSON.parse(result.contents[0].text);
		expect(parsed.error).toContain('User not found');
	});
});

describe('userProfileResource — database error', () => {
	it('returns error JSON when database throws', async () => {
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
		const { userProfileResource: freshResource } = await import('./user-profile');
		const context = createTestContext();
		const result = await freshResource.handler(new URL('user://profile'), context);
		expect(result.contents).toHaveLength(1);
		const parsed = JSON.parse(result.contents[0].text);
		expect(parsed.error).toContain('Failed to retrieve');
	});
});
