# ============================================================================
# identity-service — Dockerfile autonome (legacy)
# ============================================================================
# ⚠️  Préférer le Dockerfile générique `infrastructure/docker/Dockerfile.nestjs`
#     pour les nouveaux builds (Turborepo pruning, multi-stage optimisé,
#     HEALTHCHECK + utilisateur non-root + labels OCI).
#
#     Usage recommandé :
#       make build-service SERVICE=identity-service
#       # équivalent à :
#       docker build -f infrastructure/docker/Dockerfile.nestjs \
#         --build-arg SERVICE=identity-service \
#         -t nina-aes/identity-service:latest .
#
# Ce fichier reste disponible pour les outils qui scannent un Dockerfile par
# dossier de service (ex. certains opérateurs Kubernetes legacy). Il sera
# supprimé lorsque toute la chaîne CI/CD aura basculé sur le générique.
# ============================================================================

# ── Build stage ──
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/database/package.json ./packages/database/
COPY packages/config/package.json ./packages/config/
COPY packages/utils/package.json ./packages/utils/
COPY services/identity-service/package.json ./services/identity-service/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY services/identity-service/ ./services/identity-service/

RUN pnpm --filter @nina-aes/identity-service build

# ── Production stage ──
FROM node:24-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apk add --no-cache curl tini

# Utilisateur non-root pour conformité PodSecurityPolicy Kubernetes
RUN addgroup -g 1001 -S nina && adduser -u 1001 -S nina -G nina

COPY --from=builder --chown=nina:nina /app/services/identity-service/dist ./dist
COPY --from=builder --chown=nina:nina /app/services/identity-service/package.json ./
COPY --from=builder --chown=nina:nina /app/node_modules ./node_modules

USER nina
EXPOSE 3001
ENV NODE_ENV=production

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3001/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
