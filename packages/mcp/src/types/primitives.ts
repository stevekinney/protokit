import type { z } from 'zod';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type McpToolDefinition = {
	name: string;
	description: string;
	inputSchema: z.ZodType;
	annotations?: Record<string, unknown>;
	_meta?: Record<string, unknown>;
	handler: (input: any, context: any) => Promise<any>;
};

export type McpResourceDefinition = {
	name: string;
	uri: string;
	description: string;
	mimeType: string;
	handler: (uri: URL, context: any) => Promise<any>;
};

export type McpPromptDefinition = {
	name: string;
	description: string;
	arguments?: Record<string, z.ZodType>;
	handler: (arguments_: any, context: any) => Promise<any>;
};

/* eslint-enable @typescript-eslint/no-explicit-any */

export type McpUserProfile = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	role: string;
};

export type McpContext = {
	userId: string;
	user: McpUserProfile;
};
