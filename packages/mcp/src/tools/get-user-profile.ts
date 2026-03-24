import { z } from 'zod';
import { createToolJsonResponse } from '../tool-response.js';
import type { McpContext } from '../types/primitives.js';

export const getUserProfileTool = {
	name: 'get_user_profile' as const,
	description: "Returns the authenticated user's profile information.",
	inputSchema: z.object({}),
	handler: async (_input: Record<string, never>, context: McpContext) => {
		return createToolJsonResponse(context.user);
	},
};
