/**
 * Vitest setup file: pre-load CJS modules that have circular dependency issues
 * when loaded in vitest's module sandbox on Node.js 25.
 *
 * Root cause: Several packages in the fastify dependency tree have mutually
 * circular CJS requires. Under Node.js 25 + vitest, modules are sometimes
 * loaded out of order, causing an empty {} to be captured instead of the
 * real exports.
 *
 * The fix: pre-load fastify and all its internal modules here (in the setup
 * file) so they are fully resolved in the module cache before any test file
 * imports them. Subsequent require() calls hit the now-populated cache.
 *
 * These patches are only active in the test runner. Production runs on
 * Node 22 as required by .nvmrc, where this issue does not occur.
 */
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

// ── Pre-load semver (it has range.js ↔ comparator.js circular dep) ─────────
try {
  // Clear partial semver entries that may have loaded out of order
  for (const key of Object.keys(_require.cache ?? {})) {
    if (key.includes("/semver/") && !key.includes("/semver/node_modules/")) {
      delete (_require.cache as Record<string, unknown>)[key];
    }
  }
  _require("semver");
} catch {
  // Non-fatal
}

// ── Pre-load fastify's internal modules in the correct dependency order ─────
// This ensures the circular dep chain resolves correctly so all modules
// export their functions rather than empty objects.
try {
  // Load @fastify/error first (no deps on other fastify internals)
  _require("@fastify/error");

  // Load fastify lib modules in dependency order
  const fastifyBase = _require.resolve("fastify").replace("/fastify.js", "");

  // Level 0: no fastify deps
  _require(`${fastifyBase}/lib/symbols`);
  _require(`${fastifyBase}/lib/warnings`);

  // Level 1: depends on symbols
  _require(`${fastifyBase}/lib/errors`);

  // Level 2: depends on errors/symbols
  _require(`${fastifyBase}/lib/hooks`);
  _require(`${fastifyBase}/lib/validation`);
  _require(`${fastifyBase}/lib/decorate`);
  _require(`${fastifyBase}/lib/schemas`);

  // Level 3: depends on level 1-2
  _require(`${fastifyBase}/lib/handle-request`);
  _require(`${fastifyBase}/lib/error-handler`);
  _require(`${fastifyBase}/lib/reply`);
  _require(`${fastifyBase}/lib/request`);
  _require(`${fastifyBase}/lib/route`);
  _require(`${fastifyBase}/lib/server`);
  _require(`${fastifyBase}/lib/four-oh-four`);

  // Now load fastify itself
  _require("fastify");
} catch {
  // Non-fatal: if fastify isn't installed, skip
}
