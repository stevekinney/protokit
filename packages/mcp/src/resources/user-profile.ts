import type { McpResourceDefinition } from '../types/primitives.js';

export const userProfileResource: McpResourceDefinition = {
	name: 'user_profile',
	title: 'User Profile',
	uri: 'user://profile',
	description: "Exposes the authenticated user's own profile information as a JSON resource.",
	mimeType: 'application/json',
	requiredScope: 'profile:read',
	handler: async (uri, context) => {
		return {
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(context.user),
				},
			],
		};
	},
};
