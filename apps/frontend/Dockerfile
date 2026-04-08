# ── Stage 1: Build React app ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/frontend/package.json ./apps/frontend/

RUN npm ci

# Copy source
COPY packages/core/ ./packages/core/
COPY apps/frontend/ ./apps/frontend/
COPY tsconfig.json ./

# Build core first
RUN npm -w packages/core run build

# Build frontend (outputs to apps/frontend/dist/)
RUN npm -w apps/frontend run build

# ── Stage 2: Static files only ────────────────────────────────────────────────
# Caddy serves from a named volume populated by the frontend-build init container.
# The docker-compose.yml frontend-build service uses the `builder` target and
# copies the built dist/ into the shared `frontend_dist` volume.
# This stage is kept minimal for the init-container copy pattern.
FROM scratch AS static

COPY --from=builder /app/apps/frontend/dist /dist
