import type { McpToolDefinition } from '../types/primitives.js';

export { getUserProfileTool } from './get-user-profile.js';
export { listAuditEventsTool } from './list-audit-events.js';

import { getUserProfileTool } from './get-user-profile.js';
import { listAuditEventsTool } from './list-audit-events.js';

export const allTools: McpToolDefinition[] = [getUserProfileTool, listAuditEventsTool];
