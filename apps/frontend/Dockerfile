# ── Stage 1: Build React app ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests
# All workspace package.json files must be present for npm ci to resolve the workspace graph.
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/api/package.json ./apps/api/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/worker/package.json ./apps/worker/

RUN npm ci

# Copy source
COPY packages/core/ ./packages/core/
COPY apps/frontend/ ./apps/frontend/
# Use Docker-specific root tsconfig without workspace references that would
# require all workspace source trees to be present in the build context.
COPY tsconfig.docker.json ./tsconfig.json

# Build core first
RUN npx tsc --build packages/core/tsconfig.json

# Verify core was built
RUN ls -la packages/core/dist/

# Build frontend (outputs to apps/frontend/dist/)
# Run vite build directly — tsc type checking runs in CI, not in Docker.
RUN cd apps/frontend && npx vite build 2>&1 | tee /tmp/vite.log || (cat /tmp/vite.log && exit 1)

# ── Stage 2: Static files only ────────────────────────────────────────────────
# Caddy serves from a named volume populated by the frontend-build init container.
# The docker-compose.yml frontend-build service uses the `builder` target and
# copies the built dist/ into the shared `frontend_dist` volume.
# This stage is kept minimal for the init-container copy pattern.
FROM scratch AS static

COPY --from=builder /app/apps/frontend/dist /dist
