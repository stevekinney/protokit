import { z } from 'zod';
import { createToolStructuredResponse } from '../tool-response.js';
import { defineTool } from '../types/primitives.js';

const getUserProfileOutputSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string(),
	image: z.string().nullable(),
	role: z.string(),
});

export const getUserProfileTool = defineTool({
	name: 'get_user_profile',
	title: 'Get User Profile',
	description:
		"Returns the authenticated user's own profile (id, email, name, avatar image, role). Use this when a request needs to know who the current user is or display their identity — it never accepts a target user and never reads anyone else's profile.",
	inputSchema: z.object({}),
	outputSchema: getUserProfileOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	handler: async (_input, context) => {
		return createToolStructuredResponse(
			context.user,
			`Profile for ${context.user.name} <${context.user.email}>.`,
		);
	},
});
