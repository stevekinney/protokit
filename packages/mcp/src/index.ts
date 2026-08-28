export { createMcpServer, areResourceSubscriptionsAuthorized } from './server.js';
// PROTO-002: test-only observability for the `test_cancellable_operation`
// conformance fixture — see the comment above it in
// `conformance-fixture-registration.ts`. Exported so
// `applications/web`'s end-to-end cancellation test can assert on it
// without reaching into package internals.
export { cancellableOperationTestHooks } from './conformance-fixture-registration.js';
export { getUserProfileTool, listAuditEventsTool, allTools } from './tools/index.js';
export { userProfileResource, allResources } from './resources/index.js';
export { summarizePrompt, allPrompts } from './prompts/index.js';
export { logger, getLogger } from './logger.js';
export {
	createToolTextResponse,
	createToolJsonResponse,
	createToolStructuredResponse,
	createToolErrorResponse,
} from './tool-response.js';
export { getEnvironment, parseMcpServerEnvironment } from './env.js';
export type { McpServerEnvironment } from './env.js';
export { PACKAGE_VERSION } from './version.js';
export {
	hasValidLocalhostRebindingHeaders,
	isLoopbackHostname,
} from './localhost-request-validation.js';
export { EXTENSION_ID, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
export {
	readProgressToken,
	readSessionIdentifier,
	readNotificationSender,
	readRequestSender,
	stringifyUnknown,
	parseSampledText,
	assertSamplingSupport,
} from './handler-context.js';
export { metricsCollector } from './metrics.js';
export type { ToolMetricEntry, MetricsSnapshot } from './metrics.js';
export { defineTool, defineResource, definePrompt } from './types/primitives.js';
export type {
	McpToolDefinition,
	McpToolAnnotations,
	McpResourceDefinition,
	McpPromptDefinition,
	McpUserProfile,
	McpContext,
} from './types/primitives.js';
export { mcpScopes, mcpScopeDescriptions, isMcpScope, templateScopeVocabulary } from './scopes.js';
export { defineScopes } from './scope-vocabulary.js';
export type { McpScopeVocabulary, McpRegistry } from './scope-vocabulary.js';
export { templateRegistry } from './template-registry.js';
export type { McpScope } from './scopes.js';
export { getSupportedScopes } from './supported-scopes.js';
export { hasRegisteredUiExtensionResource } from './ui-extension-support.js';
