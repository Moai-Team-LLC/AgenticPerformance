# @apl/worker — L3 improvement sweep (Bun-native, monorepo-aware).
# Build from the repo ROOT so the workspace install sees every package:
#   docker build -f apps/worker/Dockerfile .
FROM oven/bun:1.3.11-slim

WORKDIR /app

COPY package.json bun.lock ./
COPY packages ./packages
COPY apps ./apps
COPY drizzle ./drizzle
COPY drizzle.config.ts ./

RUN bun install --frozen-lockfile --production

USER bun

CMD ["bun", "apps/worker/src/index.ts"]
