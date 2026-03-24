import { describe, it, expect } from 'bun:test';
import { createTestContext } from '../testing/context';
import { userProfileResource } from './user-profile';

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

	it('returns user profile as JSON resource from context', async () => {
		const context = createTestContext();
		const result = await userProfileResource.handler(new URL('user://profile'), context);
		expect(result.contents).toHaveLength(1);
		expect(result.contents[0].mimeType).toBe('application/json');
		const parsed = JSON.parse(result.contents[0].text);
		expect(parsed).toMatchObject({
			id: context.user.id,
			name: context.user.name,
			email: context.user.email,
		});
	});
});
