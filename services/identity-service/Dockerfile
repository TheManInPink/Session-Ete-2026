# ── Build stage ──
FROM node:lts-alpine3.22 AS builder
WORKDIR /app
RUN npm install -g pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/database/package.json ./packages/database/
COPY packages/config/package.json ./packages/config/
COPY packages/utils/package.json ./packages/utils/
COPY services/identity-service/package.json ./services/identity-service/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY services/identity-service/ ./services/identity-service/
COPY tsconfig.base.json ./

RUN pnpm --filter @nina-aes/identity-service build

# ── Production stage ──
FROM node:lts-alpine3.22 AS runner
WORKDIR /app
RUN npm install -g pnpm

COPY --from=builder /app/services/identity-service/dist ./dist
COPY --from=builder /app/services/identity-service/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
