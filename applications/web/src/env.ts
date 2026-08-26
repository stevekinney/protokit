import { environmentalist } from '@lostgradient/environmentalist';
import { z } from 'zod';

import { webServerEnvironmentSchema } from '@web/environment-schema';

// CONFIG-001 / BUG-001: `SKIP_ENV_VALIDATION=true` used to make `@t3-oss/env-core`
// bypass the whole Zod schema, including every `.default(...)` value — that is
// exactly what produced BUG-001's `NaN`-into-Redis defect. The escape hatch is
// removed outright rather than merely gated on `NODE_ENV`: setting the variable
// now fails loudly instead of being silently ignored or silently trusted.
if (process.env.SKIP_ENV_VALIDATION) {
	throw new Error(
		'SKIP_ENV_VALIDATION is not supported. Supply a real environment instead — see .env.example.',
	);
}

// CONFIG-001 / BUG-001: Environmentalist's `env` source claims any variable
// where `value !== undefined`, so an empty string (which Railway and other
// hosts can set) passes straight through — and for a numeric field its
// coercion does `Number('')`, which is `0`, not `NaN`, silently bypassing
// `.default()` entirely rather than failing loudly. `@t3-oss/env-core`'s
// `emptyStringAsUndefined: true` used to prevent exactly this; there is no
// equivalent option here, so it is reproduced by hand: strip empty-string
// entries before handing the environment to the resolver so an unset-but-
// present variable falls through to the schema default, same as before.
//
// `Object.entries(process.env)` — a dynamic read of the whole object, not a
// static member access — is also what keeps this file's NODE_ENV read alive
// at runtime rather than getting constant-folded into the built artifact by
// Bun's bundler; `build.ts` asserts this stays true.
const processEnv: Record<string, string> = Object.fromEntries(
	Object.entries(process.env).filter(
		(entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '',
	),
);

// `RAILWAY_REPLICA_IDENTIFIER` and `HOSTNAME_IDENTIFIER` are not real
// environment-variable names — they resolve from a choice between Railway's
// two replica-identifying variables, or the generic `HOSTNAME` a bare-name
// lookup would otherwise be too promiscuous to bind to directly.
// Environmentalist derives one env-var spelling per canonical key with no
// built-in fallback chain, so the choice happens here and is handed to the
// resolver under the exact derived name it expects. Omit the key entirely
// when no source value exists, rather than setting it to `undefined` — the
// resolver's `env` source only accepts `Record<string, string>`, and an
// absent key correctly falls through to the schema's `.optional()`.
const railwayReplicaIdentifier = processEnv.RAILWAY_REPLICA_ID ?? processEnv.RAILWAY_INSTANCE_ID;
const env: Record<string, string> = {
	...processEnv,
	...(railwayReplicaIdentifier !== undefined
		? { RAILWAY_REPLICA_IDENTIFIER: railwayReplicaIdentifier }
		: {}),
	...(processEnv.HOSTNAME !== undefined ? { HOSTNAME_IDENTIFIER: processEnv.HOSTNAME } : {}),
};

export const environment = environmentalist.sync({
	name: 'protokit-web',
	schema: z.object(webServerEnvironmentSchema),
	env,
	// This is a server process, not a CLI or an app with project config
	// files/home dotfiles to honor — restrict resolution to the real
	// environment plus schema defaults, matching `@t3-oss/env-core`'s
	// behavior exactly and avoiding the trust boundary of loading a
	// `.ts`/`.js` config file or a user's home directory at boot.
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
