import type { McpPromptDefinition } from '../types/primitives.js';

export { summarizePrompt } from './summarize.js';

import { summarizePrompt } from './summarize.js';

export const allPrompts: McpPromptDefinition[] = [summarizePrompt];
