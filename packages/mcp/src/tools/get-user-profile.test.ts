import { describe, it, expect } from 'bun:test';
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
});
