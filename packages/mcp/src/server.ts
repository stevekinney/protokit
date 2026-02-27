import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUserProfileTool } from './tools/get-user-profile.js';
import { userProfileResource } from './resources/user-profile.js';
import { summarizePrompt } from './prompts/summarize.js';

export function createMcpServer(context: { userId: string }): McpServer {
	const server = new McpServer({
		name: 'template-mcp-server',
		version: '0.1.0',
	});

	server.registerTool(
		getUserProfileTool.name,
		{
			description: getUserProfileTool.description,
			inputSchema: getUserProfileTool.inputSchema,
		},
		async () => getUserProfileTool.handler({}, context),
	);

	server.registerResource(
		userProfileResource.name,
		userProfileResource.uri,
		{ description: userProfileResource.description, mimeType: userProfileResource.mimeType },
		async (uri) => userProfileResource.handler(uri, context),
	);

	server.registerPrompt(
		summarizePrompt.name,
		{ description: summarizePrompt.description, argsSchema: summarizePrompt.arguments },
		async (arguments_) => summarizePrompt.handler(arguments_, context),
	);

	return server;
}
