# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-08)

**Core value:** Executives see the health of ACM's inventory and production at a glance — on a single dashboard — without touching Apollo NTS.

**Current focus:** Phase 1 — Foundation & Auth

## Status

- **Milestone:** v1 (initial release)
- **Phases completed:** 0 / 8
- **Phase in progress:** Phase 1 — Foundation & Auth (Plan 4 of N complete)
- **Last completed plan:** 01-04 Fastify API skeleton
- **Next action:** Plan 05 — LDAP auth

## Artifacts

| File | Purpose |
|---|---|
| `.planning/PROJECT.md` | Project context, core value, constraints, decisions |
| `.planning/REQUIREMENTS.md` | 67 v1 requirements + traceability to phases |
| `.planning/ROADMAP.md` | 8-phase roadmap with parallelization map and pitfall gating |
| `.planning/config.json` | Workflow settings (YOLO, standard granularity, budget model, research-on) |
| `.planning/research/STACK.md` | Recommended technology stack with versions |
| `.planning/research/FEATURES.md` | Table-stakes vs differentiators vs anti-features |
| `.planning/research/ARCHITECTURE.md` | Container topology, ingestion pipeline, DB schema |
| `.planning/research/PITFALLS.md` | Top pitfalls with phase mapping |
| `.planning/research/SUMMARY.md` | Research synthesis consumed by roadmap |
| `samples/README.md` | CSV quirk documentation (critical for parser) |
| `samples/LagBes-sample.csv` | Golden-file fixture for parser tests |
| `samples/LagBes.txt` | **Expected** — full production sample (not yet provided) |
| `assets/acm-logo.png` | **Expected** — brand logo + favicon source (not yet provided) |

## Open Dependencies on External Input

Non-blocking, but needed before implementation of the relevant phase:

1. **Full `samples/LagBes.txt`** — real 10k+ row export. Needed before/during Phase 2 (parser stress testing).
2. **`assets/acm-logo.png`** — actual logo file. Needed before/during Phase 1 (UI shell + favicon).
3. **AD structure and service account** — needed during Phase 1 discuss phase (for LDAP integration scope).
4. **Target OS + SELinux mode** — needed during Phase 8 (deployment hardening).
5. **Internal CA cert** (or go/no-go on self-signed) — needed during Phase 1 or Phase 8 depending on when TLS is wired up.

## Git

- Repository initialized: yes
- `.planning/` tracked in git: yes (per config `commit_docs: true`)
- Recent commits:
  - `318b2cd` docs: add roadmap and phase traceability
  - `4ba3ccf` docs: define v1 requirements
  - `eddbf50` docs: add research summary
  - `d3905bc` docs: add domain research
  - `fab382d` chore: add project config
  - `d96bc68` docs: initialize project

## Workflow Configuration

From `.planning/config.json`:

- Mode: YOLO (auto-advance plan → execute → verify)
- Granularity: standard (6–8 phases, 3–5 plans each)
- Parallelization: enabled
- Commit planning docs: yes
- Model profile: budget (Haiku-preferred)
- Research before each phase: yes
- Plan checker agent: yes
- Verifier agent: yes
- Nyquist validation: yes

## Decisions

| Phase | Decision |
|-------|----------|
| 01-04 | /healthz ldap_reachable returns boolean false stub (not object) until Plan 05 wires ldapts |
| 01-04 | LOG_LEVEL enum extended with "silent" to support Vitest runs |
| 01-04 | pino-pretty transport applied only in development; production uses plain pino JSON |

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01 | 04 | ~25 min | 2/2 | 5 |

---
*Last updated: 2026-04-08 after 01-04 Fastify API skeleton*
