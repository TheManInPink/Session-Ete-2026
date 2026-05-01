FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY services/api-gateway/ ./services/api-gateway/

RUN pnpm install --frozen-lockfile --filter @nina-aes/api-gateway...
RUN pnpm --filter @nina-aes/api-gateway build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable pnpm

COPY --from=builder /app/services/api-gateway/dist ./dist
COPY --from=builder /app/services/api-gateway/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/main"]
