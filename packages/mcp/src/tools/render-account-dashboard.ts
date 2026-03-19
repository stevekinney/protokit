import { z } from 'zod';
import { logger } from '../logger.js';
import {
	emitRequestProgress,
	runWithStandardizedTimeout,
} from '../long-running-operation-support.js';

type ToolRequestContext = {
	_meta?: {
		progressToken?: string | number;
	};
};

function readProgressToken(extra: unknown): string | number | undefined {
	if (!extra || typeof extra !== 'object') return undefined;
	const requestInfo = (extra as Record<string, unknown>).requestInfo;
	if (!requestInfo || typeof requestInfo !== 'object') return undefined;
	const request = (requestInfo as Record<string, unknown>).request;
	if (!request || typeof request !== 'object') return undefined;
	return ((request as ToolRequestContext)._meta?.progressToken ?? undefined) as
		| string
		| number
		| undefined;
}

function readAbortSignal(extra: unknown): AbortSignal | undefined {
	if (!extra || typeof extra !== 'object') return undefined;
	const signal = (extra as Record<string, unknown>).signal;
	return signal instanceof AbortSignal ? signal : undefined;
}

function readNotificationSender(
	extra: unknown,
):
	| ((notification: { method: string; params: Record<string, unknown> }) => Promise<void>)
	| undefined {
	if (!extra || typeof extra !== 'object') return undefined;
	const sender = (extra as Record<string, unknown>).sendNotification;
	return typeof sender === 'function'
		? (sender as (notification: {
				method: string;
				params: Record<string, unknown>;
			}) => Promise<void>)
		: undefined;
}

export const renderAccountDashboardTool = {
	name: 'render_account_dashboard' as const,
	description:
		'Returns account dashboard state and links a UI resource for MCP App-compatible hosts.',
	inputSchema: z.object({
		section: z.enum(['overview', 'security', 'usage']).optional().default('overview'),
	}),
	handler: async (
		input: { section: 'overview' | 'security' | 'usage' },
		context: { userId: string },
		extra?: unknown,
	) => {
		const requestLogger = logger.child({
			tool: 'render_account_dashboard',
			userId: context.userId,
		});
		const progressToken = readProgressToken(extra);
		const sendNotification = readNotificationSender(extra);
		const abortSignal = readAbortSignal(extra);

		await emitRequestProgress({
			sendNotification,
			progressToken,
			progress: 10,
			total: 100,
			message: 'Preparing dashboard data',
		});

		const state = await runWithStandardizedTimeout({
			timeoutMilliseconds: 15_000,
			abortSignal,
			operation: async () => {
				return {
					userId: context.userId,
					section: input.section,
					generatedAt: new Date().toISOString(),
				};
			},
		});

		await emitRequestProgress({
			sendNotification,
			progressToken,
			progress: 100,
			total: 100,
			message: 'Dashboard ready',
		});

		requestLogger.info({ section: input.section }, 'Tool completed');

		return {
			content: [
				{
					type: 'text' as const,
					text: `Prepared dashboard for section "${input.section}".`,
				},
			],
			structuredContent: state,
			_meta: {
				ui: {
					resourceUri: 'ui://account-dashboard',
				},
			},
		};
	},
};
