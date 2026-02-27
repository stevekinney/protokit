import { describe, it, expect } from 'bun:test';
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
});
