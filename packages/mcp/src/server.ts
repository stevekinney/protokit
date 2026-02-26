import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUserProfileTool } from './tools/get-user-profile.js';

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

	return server;
}
