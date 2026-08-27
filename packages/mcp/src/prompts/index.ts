import type { z } from 'zod';
import type { McpPromptDefinition } from '../types/primitives.js';
import type { McpScope } from '../scopes.js';

export { summarizePrompt } from './summarize.js';

import { summarizePrompt } from './summarize.js';

export const allPrompts: McpPromptDefinition<Record<string, z.ZodType> | undefined, McpScope>[] = [
	summarizePrompt,
];
