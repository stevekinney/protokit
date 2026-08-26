import { environmentalist } from '@lostgradient/environmentalist';
import { z } from 'zod';

import { mcpServerEnvironmentSchema } from './environment-schema.js';

// CONFIG-001 / BUG-001: see applications/web/src/env.ts for the full
// explanation. The escape hatch is removed everywhere, not just gated on
// `NODE_ENV`, so setting it anywhere fails loudly instead of being ignored.
if (process.env.SKIP_ENV_VALIDATION) {
	throw new Error(
		'SKIP_ENV_VALIDATION is not supported. Supply a real environment instead — see .env.example.',
	);
}

// CONFIG-001 / BUG-001: see packages/database/src/env.ts for the full
// rationale — Environmentalist's `env` source lets an empty string through
// and coerces a numeric field's `''` to `0` rather than `NaN`, silently
// bypassing `.default()`. Reproduced here for the same reason.
const env: Record<string, string> = Object.fromEntries(
	Object.entries(process.env).filter(
		(entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '',
	),
);

export const environment = environmentalist.sync({
	name: 'protokit-mcp',
	schema: z.object(mcpServerEnvironmentSchema),
	env,
	// See packages/database/src/env.ts — no project config files or home
	// dotfiles for a server process.
	exclude: [
		'flags',
		'search-params',
		'dotenv',
		'project-config',
		'package-json',
		'user-dotfile',
		'xdg-config',
		'home-config',
	],
});

// OBS-001: the same fail-closed shape as the `SKIP_ENV_VALIDATION` check
// above — a schema `.refine()` cannot see NODE_ENV here (this schema shape
// is shared, side-effect-free, and intentionally has no cross-field
// checks), so this is enforced imperatively, once, right after validation.
// A diagnostic timestamp value is otherwise legitimate in development/test;
// only production refuses it outright, regardless of how far in the future
// it is set.
if (environment.nodeEnv === 'production' && environment.logContentDiagnosticsUntil) {
	throw new Error(
		'LOG_CONTENT_DIAGNOSTICS_UNTIL is not supported in production. Raw prompt content logging cannot run in production.',
	);
}
