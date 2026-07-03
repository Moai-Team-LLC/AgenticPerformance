# @apl/ingest — OTLP/JSON trace ingest server (Bun-native, monorepo-aware).
# Build from the repo ROOT so the workspace install sees every package:
#   docker build -f apps/ingest/Dockerfile .
FROM oven/bun:1.3.11-slim

WORKDIR /app

COPY package.json bun.lock ./
COPY packages ./packages
COPY apps ./apps
COPY drizzle ./drizzle
COPY drizzle.config.ts ./

RUN bun install --frozen-lockfile --production

USER bun

EXPOSE 4319

CMD ["bun", "apps/ingest/src/index.ts"]
