import { createRequire } from 'node:module';
import pino from 'pino';
import type { DestinationStream, LoggerOptions } from 'pino';
import { getEnvironment } from './env.js';

/**
 * OBS-001 / S-14: `logger.ts` previously declared no redaction paths at
 * all, so any structured field that happened to carry a credential-shaped
 * value would be written verbatim. This template's request boundary
 * legitimately handles OAuth authorization codes, PKCE verifiers, access
 * and refresh tokens, ID tokens, client secrets, session cookies, database
 * and Redis connection strings (which embed credentials in the URL itself),
 * and user email addresses — every one of those has a named path here.
 *
 * Pino's `redact.paths` (backed by `fast-redact`) matches by KEY, not by
 * value, and its wildcard (`*`) only spans a single object level — there is
 * no recursive `**`. So paths are enumerated at the depths this codebase
 * actually logs at: top-level (a call site logs `{ token, ... }` directly),
 * one level nested (`{ headers: { authorization } }`,
 * `{ client: { client_secret } }`), and the specific two-level `headers.*`
 * shape a request-logging call site would use. A secret landing at some
 * other, unanticipated depth is not caught by key-path redaction — that gap
 * is exactly what `redactSecretValues` below (wired through pino's
 * `hooks.streamWrite`) exists to catch by VALUE instead, and
 * `redaction.test.ts` proves both mechanisms against a real, unmocked
 * logger rather than trusting this list is complete.
 */
export const redactionPaths: readonly string[] = [
	// Top-level: a call site logs the sensitive field directly on the log object.
	'authorization',
	'cookie',
	'["set-cookie"]',
	'token',
	'access_token',
	'refresh_token',
	'id_token',
	'code',
	'code_verifier',
	'code_challenge',
	'client_secret',
	'password',
	'state',
	'topic',
	'email',
	'DATABASE_URL',
	'REDIS_URL',
	'databaseUrl',
	'redisUrl',
	'query',
	'body',
	'formData',
	'headers.authorization',
	'headers.cookie',
	// One level nested: the sensitive field lives on a child object
	// (`{ headers: {...} }`, `{ client: {...} }`, an `err` with extra
	// properties attached, etc.).
	'*.authorization',
	'*.cookie',
	'*["set-cookie"]',
	'*.token',
	'*.access_token',
	'*.refresh_token',
	'*.id_token',
	'*.code',
	'*.code_verifier',
	'*.code_challenge',
	'*.client_secret',
	'*.password',
	'*.state',
	'*.topic',
	'*.email',
	'*.DATABASE_URL',
	'*.REDIS_URL',
	'*.databaseUrl',
	'*.redisUrl',
	'*.query',
	'*.body',
	'*.formData',
	// Two levels nested: the common `{ <anything>: { headers: { authorization } } }`
	// shape (e.g. a logged request/response object).
	'*.headers.authorization',
	'*.headers.cookie',
];

/**
 * Value-based redaction, applied to the fully serialized log line via
 * pino's `hooks.streamWrite` (the string is already valid JSON at that
 * point; each pattern is replaced in place, which keeps the JSON valid
 * since only a string VALUE's contents change, never structure or
 * quoting). This is deliberately narrow — it targets shapes that are
 * unambiguously secrets wherever they appear, not a general-purpose
 * scanner, per the roadmap's "redact by value as well as by common key
 * where practical" and "do not reinvent [pino's redaction]": pino owns key
 * redaction; this only covers the value shapes key redaction structurally
 * cannot reach (an unanticipated nesting depth, a secret interpolated into
 * a free-text error message).
 */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
	// `Authorization: Bearer <token>` or a bare bearer token value.
	/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
	// JSON Web Tokens (ID tokens, and any access token issued as a JWT):
	// three base64url segments, the first always decoding to a JSON object
	// and therefore always starting with `eyJ`.
	/eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g,
	// Postgres/Redis connection strings with inline credentials.
	/(?:postgres(?:ql)?|rediss?):\/\/[^:@/\s"]+:[^@/\s"]+@[^\s"]+/gi,
];

function redactSecretValues(serialized: string): string {
	let result = serialized;
	for (const pattern of SECRET_VALUE_PATTERNS) {
		result = result.replace(pattern, '[REDACTED]');
	}
	return result;
}

/**
 * A factory, not just a singleton export, so tests can build a real logger
 * — the actual redaction config below, not a copy of it — against an
 * in-memory destination instead of stdout. Passing `destination` also
 * forces plain JSON output (no `pino-pretty` transport): pino refuses to
 * combine `options.transport` with a destination stream argument, and
 * tests need to parse exactly what was written, not a human-formatted
 * approximation of it.
 */
export function createLogger(options?: { destination?: DestinationStream }): pino.Logger {
	const environment = getEnvironment();
	const baseOptions: LoggerOptions = {
		level: environment.LOG_LEVEL,
		redact: { paths: [...redactionPaths], censor: '[REDACTED]' },
		hooks: { streamWrite: redactSecretValues },
	};

	if (options?.destination) {
		return pino(baseOptions, options.destination);
	}

	// `pino-pretty` is a devDependency, so it is absent from the production
	// runtime image, which installs with `--production`. Selecting the transport
	// on `NODE_ENV` alone therefore crashed the shipped container on startup
	// ("unable to determine transport target for pino-pretty") for any run that
	// was not `NODE_ENV=production` — which is exactly what the container smoke
	// test does, deliberately, because the production startup invariants demand
	// HTTPS and real credentials.
	//
	// That crash was latent until DEPLOY-001 stopped the bundler baking
	// NODE_ENV in at build time: while every image reported "production", this
	// branch was unreachable inside a container and nothing noticed.
	//
	// Resolve before requiring, and fall back to plain JSON. Pretty output is a
	// developer convenience; refusing to start because a formatting dependency
	// is missing is never the right trade.
	const prettyTransportAvailable =
		environment.NODE_ENV !== 'production' && canResolvePrettyTransport();

	// `transport` spawns pino-pretty on a worker thread via thread-stream.
	// Under Bun 1.4.0, `bun test` now surfaces that worker's exit as an
	// unhandled error between test files instead of tolerating it silently,
	// cascading into unrelated test failures. `canResolvePrettyTransport()`
	// above still runs unconditionally so its own resolution/fallback logic
	// stays covered; only the decision to actually hand the worker-based
	// transport to `pino()` is additionally gated on not being under test —
	// pretty-printing is a developer convenience `bun test` doesn't need.
	const useWorkerTransport = prettyTransportAvailable && environment.NODE_ENV !== 'test';

	return pino({
		...baseOptions,
		...(useWorkerTransport && { transport: { target: 'pino-pretty' } }),
	});
}

function canResolvePrettyTransport(): boolean {
	try {
		// `createRequire` rather than a Bun-specific resolver: this package's
		// tsconfig does not pull in Bun's globals, and module resolution is the
		// one thing here with a portable answer.
		createRequire(import.meta.url).resolve('pino-pretty');
		return true;
	} catch {
		return false;
	}
}

/**
 * The shared logger, constructed on first use rather than on import.
 *
 * `createLogger()` reads the environment, so calling it at module scope
 * would put an environment read — and a validation throw — back into this
 * package's import graph, which is the whole thing `env.ts` was reworked to
 * avoid. A getter-backed proxy keeps every existing call site
 * (`logger.info(...)`, `logger.child(...)`) working unchanged while moving
 * the first environment read to the first log call.
 *
 * `getLogger()` is exported alongside it for callers that want the real
 * instance rather than the proxy — passing the proxy somewhere that
 * inspects it with `instanceof` or copies its own properties would not
 * behave identically.
 */
let cachedLogger: pino.Logger | undefined;

export function getLogger(): pino.Logger {
	cachedLogger ??= createLogger();
	return cachedLogger;
}

export const logger: pino.Logger = new Proxy({} as pino.Logger, {
	// Only `get` and `set` are trapped. Reflecting `ownKeys`,
	// `getOwnPropertyDescriptor`, or `getPrototypeOf` from the real logger
	// makes the proxy describe properties its target (a permanently empty
	// object) does not have, and the engine then rejects the `get` result
	// for violating the proxy invariants — which is exactly what broke
	// `logger.info.bind(logger)` in the diagnostics tests. Property access
	// and assignment are the entire surface call sites use.
	//
	// Neither trap forwards `receiver`. With the proxy as receiver,
	// `Reflect.set` defines the property on the *proxy's target* -- the empty
	// object -- while `get` keeps reading from the real logger, so a test that
	// monkey-patches `logger.info` would silently have no effect. Passing the
	// real logger as both target and receiver keeps reads and writes on the
	// same object.
	get(_target, property) {
		return Reflect.get(getLogger(), property);
	},
	set(_target, property, value) {
		return Reflect.set(getLogger(), property, value);
	},
});
