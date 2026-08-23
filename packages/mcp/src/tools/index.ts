import type { McpToolDefinition } from '../types/primitives.js';

export { getUserProfileTool } from './get-user-profile.js';
export { listAuditEventsTool } from './list-audit-events.js';

import { getUserProfileTool } from './get-user-profile.js';
import { listAuditEventsTool } from './list-audit-events.js';

// CONTENT-001: `allTools` is the *production* tool registry — every entry
// here is advertised and callable against a real deployment. It must never
// contain a synthetic/protocol-conformance-only fixture.
export const allTools: McpToolDefinition[] = [getUserProfileTool];

// CONTENT-001: tools defined with `defineTool()` (so they carry the same
// required metadata as production tools) but only ever registered when
// `enableConformanceMode` is true — see `server.ts`. `list_audit_events`
// returns synthetic, generated data and exists to exercise cursor
// pagination in protocol conformance tests; it must never be reachable in a
// normal production deployment.
export const conformanceOnlyTools: McpToolDefinition[] = [listAuditEventsTool];
