# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests first (layer cache optimization)
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/api/package.json ./apps/api/

# Install all dependencies (includes devDependencies for build)
RUN npm ci

# Copy source code
COPY packages/core/ ./packages/core/
COPY apps/api/ ./apps/api/
COPY tsconfig.json ./

# Build core package first (api depends on it)
RUN npm -w packages/core run build

# Build API
RUN npm -w apps/api run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Create non-root user (PITFALL #9: explicit UID for volume permission alignment)
# UID 1000 is conventional for the first non-root user on Linux hosts.
RUN addgroup -g 1000 appuser && \
    adduser -u 1000 -G appuser -s /sbin/nologin -D appuser

# Copy built output + production node_modules from builder
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/apps/api/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/apps/api/package.json ./
COPY --from=builder --chown=appuser:appuser /app/apps/api/drizzle ./drizzle

# Copy entrypoint script
COPY --chown=appuser:appuser apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/healthz || exit 1

ENTRYPOINT ["./entrypoint.sh"]
