Run the health-check diagnostic.

1. Run `bun run doctor` (or `bun scripts/doctor.ts`). It checks development configuration by
   default. Pass `--production` to check against production's fail-closed requirements instead —
   the same ones `server.ts` enforces at startup — or let it infer that automatically when
   `NODE_ENV=production` is already set.
2. Review the output for any failures or warnings. Every environment variable check comes
   directly from each package's `environment-schema.ts` — nothing about which variables exist or
   what makes them valid is hardcoded in the script itself.
3. For each failure, suggest a concrete fix (e.g., missing CLI install command, missing or
   invalid environment variable — never repeat the variable's current value back, since doctor
   deliberately never prints one).
4. For warnings, explain whether they matter for the user's current workflow.
