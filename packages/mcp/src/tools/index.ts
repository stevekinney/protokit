import type { z } from 'zod';
import type { McpToolDefinition } from '../types/primitives.js';
import type { McpScope } from '../scopes.js';

export { getUserProfileTool } from './get-user-profile.js';
export { listAuditEventsTool } from './list-audit-events.js';

import { getUserProfileTool } from './get-user-profile.js';
import { listAuditEventsTool } from './list-audit-events.js';

/**
 * The widest legal element type for a heterogeneous registry, pinned to this
 * repository's own vocabulary. The schema parameters stay at their defaults
 * for the reason the `McpToolDefinition` comment gives — the handler is a
 * method shorthand, so parameter checking is bivariant and a concretely
 * typed tool can live in this array without widening its own handler by
 * hand.
 */
type TemplateTool = McpToolDefinition<z.ZodType, z.ZodType | undefined, McpScope>;

// CONTENT-001: `allTools` is the *production* tool registry — every entry
// here is advertised and callable against a real deployment. It must never
// contain a synthetic/protocol-conformance-only fixture.
//
// This is now this repository's own registry rather than the only one that
// can exist: a consumer supplies its own through `McpRegistry` and never
// edits this file. See `scope-vocabulary.ts`.
export const allTools: TemplateTool[] = [getUserProfileTool];

// CONTENT-001: tools defined with `defineTool()` (so they carry the same
// required metadata as production tools) but only ever registered when
// `enableConformanceMode` is true — see `server.ts`. `list_audit_events`
// returns synthetic, generated data and exists to exercise cursor
// pagination in protocol conformance tests; it must never be reachable in a
// normal production deployment.
export const conformanceOnlyTools: TemplateTool[] = [listAuditEventsTool];
