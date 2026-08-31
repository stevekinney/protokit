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
export { logger, getLogger, setLogger } from './logger.js';
export type { McpLogger } from './logger.js';
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
// Imported and re-exported rather than forwarded with `export ... from`.
// The bundler that builds `dist/` drops the source binding of a re-export
// whose module is external: it emitted `export { EXTENSION_ID }` with no
// corresponding import, and Node rejected the module with "Export
// 'EXTENSION_ID' is not defined in module". Binding the values locally forces
// the import to survive. This is the only re-export from an external package
// in this package's entry points; the other nineteen are relative and bundle
// correctly.
import {
	EXTENSION_ID as extensionId,
	RESOURCE_MIME_TYPE as resourceMimeType,
} from '@modelcontextprotocol/ext-apps/server';

export const EXTENSION_ID = extensionId;
export const RESOURCE_MIME_TYPE = resourceMimeType;
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
export { defineOAuthScopeConfiguration } from './oauth-scope-configuration.js';
export { createConsumerConformanceHandler, runMcpConformance } from './conformance.js';
export type {
	ConsumerConformanceOptions,
	McpConformanceEra,
	McpConformanceIdentity,
	McpConformanceResult,
	RunMcpConformanceOptions,
} from './conformance.js';
export { hasRegisteredUiExtensionResource } from './ui-extension-support.js';
