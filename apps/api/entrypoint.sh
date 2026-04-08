#!/bin/sh
# ACM KPI Pro — API container entrypoint
# Runs preflight checks, then starts the Fastify server.
# (PITFALL #9: Docker volume perms / SELinux preflight)
set -e

echo "[entrypoint] ACM KPI Pro API starting..."

# ── Preflight: PostgreSQL connectivity ────────────────────────────────────────
# Extract host and port from DATABASE_URL (postgres://user:pass@host:port/db)
# Uses node to parse the URL reliably (handles IPv6, unusual ports, etc.)
echo "[preflight] Waiting for PostgreSQL at $DATABASE_URL..."
MAX_TRIES=30
TRIES=0
until node --input-type=module -e "
import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
" 2>/dev/null; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -ge "$MAX_TRIES" ]; then
    echo "[preflight] ERROR: PostgreSQL not reachable after $MAX_TRIES attempts. Exiting."
    exit 1
  fi
  echo "[preflight] PostgreSQL not ready, retrying ($TRIES/$MAX_TRIES)..."
  sleep 2
done
echo "[preflight] PostgreSQL is reachable."

# ── Preflight: Volume permissions ─────────────────────────────────────────────
# Check if any mounted volumes have incorrect ownership.
# (PITFALL #9: UID mismatch causes write failures at runtime)
CURRENT_UID=$(id -u)
for VOL_PATH in /app/uploads /mnt/smb-share; do
  if [ -d "$VOL_PATH" ]; then
    OWNER_UID=$(stat -c %u "$VOL_PATH" 2>/dev/null || echo "unknown")
    if [ "$OWNER_UID" != "$CURRENT_UID" ] && [ "$OWNER_UID" != "unknown" ]; then
      echo "[preflight] WARNING: $VOL_PATH is owned by UID $OWNER_UID but container runs as UID $CURRENT_UID."
      echo "[preflight] WARNING: Write operations to $VOL_PATH may fail. Fix with: chown -R $CURRENT_UID:$CURRENT_UID $VOL_PATH on the host."
    fi
  fi
done

# ── Run database migrations ───────────────────────────────────────────────────
echo "[migrate] Running database migrations..."
node dist/db/migrate.js
echo "[migrate] Migrations complete."

# ── Start server ──────────────────────────────────────────────────────────────
echo "[entrypoint] Starting Fastify API on port ${API_PORT:-3000}..."
exec node dist/index.js
