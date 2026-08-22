# syntax=docker/dockerfile:1
#
# SUPPLY-001: every stage below is pinned by immutable digest rather than a
# mutable tag, so `docker build` resolves the exact same base layers on every
# machine and every day. Re-pin deliberately (new digest, reviewed) rather
# than switching back to a floating tag.
#
# oven/bun:1.3.14            (builder — has a shell, package manager, bun)
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY applications/web/package.json ./applications/web/
COPY packages/database/package.json ./packages/database/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/mcp-apps/package.json ./packages/mcp-apps/

RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production

RUN bun turbo build --filter=./applications/web

# Runtime dependency tree, isolated from the builder's full (dev-inclusive)
# install. `--production` omits every workspace's devDependencies, so
# build-only tooling (drizzle-kit, eslint, typescript-eslint, playwright,
# esbuild, tsx, and everything each of those pulls in transitively) never
# reaches the image that ships.
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS runtime-deps

WORKDIR /app

COPY package.json bun.lock ./
COPY applications/web/package.json ./applications/web/
COPY packages/database/package.json ./packages/database/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/mcp-apps/package.json ./packages/mcp-apps/

RUN bun install --frozen-lockfile --production --ignore-scripts

# oven/bun:1.3.14-distroless (runner — no shell, no package manager, no dev
# tooling at all; only the bun runtime and whatever is explicitly COPY'd in)
FROM oven/bun:1.3.14-distroless@sha256:c28c51287af70bab8e0b66fc4b6a30cfb92a727ebc88045223adc9f4c9d09307 AS runner

WORKDIR /app

# `applications/web/src/build.ts` bundles src/server.ts into a single file;
# node_modules is only needed for the handful of packages ajv resolves at
# runtime via dynamic `require()` (its own code-generated validators), which
# a static bundler cannot inline. Nothing else in this tree is imported by
# the built server at runtime.
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=builder /app/applications/web/dist/server.js ./applications/web/dist/server.js
COPY --from=builder /app/applications/web/public ./applications/web/public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# The distroless base ships a built-in unprivileged `nonroot` (65532:65532)
# account. Every file above is COPY'd in owned by root and never written to
# at runtime, so running as this account also makes a read-only root
# filesystem (`docker run --read-only`) work without a writable app
# directory. This process itself needs no writable scratch space; if a
# future change needs one, mount a tmpfs at a documented path rather than
# relaxing this.
USER 65532:65532

# Liveness probe: the protected-resource discovery endpoint is static
# metadata that never touches Postgres or Redis (verified: it returns 200
# even while the database is unreachable, see DEPLOY-001's evidence).
#
# OPS-002 split `GET /health` into this same dependency-free shape (public
# liveness only; dependency status moved to the authenticated
# `GET /health/ready`), so it would now be an equally valid choice here. Kept
# on the well-known endpoint anyway rather than switching: it is the one
# DEPLOY-001 already verified against this exact image, switching gains
# nothing (both are equally cheap, dependency-free, unauthenticated 200s),
# and this file cannot be exercised in this environment (no `docker build`),
# so avoiding a same-behavior, unverified edit is the safer choice. A
# `/health`-based check would still couple container liveness to downstream
# dependency health if the wrong endpoint were picked here — that coupling
# is exactly what `/health/ready` exists to keep separate from liveness.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/.well-known/oauth-protected-resource/mcp').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# The distroless base already sets ENTRYPOINT ["bun"]; CMD supplies only the
# script argument (repeating "bun" here would run `bun bun <script>`, which
# is not a script bun can resolve and falls back to a browser-target parse
# that fails on Node-only APIs the server needs).
CMD ["applications/web/dist/server.js"]
