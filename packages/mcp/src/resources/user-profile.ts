import type { McpContext } from '../types/primitives.js';

export const userProfileResource = {
	name: 'user_profile' as const,
	uri: 'user://profile',
	description: "Exposes the authenticated user's profile information as a JSON resource.",
	mimeType: 'application/json',
	handler: async (uri: URL, context: McpContext) => {
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
