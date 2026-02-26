FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY applications/web/package.json ./applications/web/
COPY packages/database/package.json ./packages/database/
COPY packages/mcp/package.json ./packages/mcp/

RUN bun install --frozen-lockfile

COPY . .

RUN bun turbo build --filter=@template/web

FROM node:22-slim AS runner

WORKDIR /app

COPY --from=builder /app/applications/web/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/applications/web/package.json ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "build/index.js"]
