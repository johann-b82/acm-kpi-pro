# Phase 2: CSV Ingestion Core — Plan Index

**Phase:** 02-csv-ingestion-core
**Goal:** After this phase, `npm -w apps/api run ingest:local -- samples/LagBes-sample.csv`
reads the real LagBes sample, parses it (Windows-1252, semicolon delimiter, decimal-comma
re-merge, DD.MM.YY dates, negative stock), validates every row via Zod (collecting all
errors), writes batches into a staging table in a Drizzle transaction, atomically swaps
`stock_rows` with staged rows, and records the attempt in the `imports` audit table. On
failure at any step, the previous `stock_rows` snapshot is untouched. Unit tests using
`vi.mock` for the DB pass without Docker. Golden-file tests against
`samples/LagBes-sample.csv` pass. A `FeedParser` interface is exposed in `packages/core`
so Phase 3+ can register new feeds.

**Boundary (strict):** No HTTP endpoint, no Bull queue, no SMB watcher, no KPI computation.

---

## Plans in This Phase

| Plan | Slug | Wave | Parallel With | Requirements |
|------|------|------|---------------|--------------|
| 02-02 | schema-and-migration | 1 | 02-03 | KPI-01, IN-10 |
| 02-03 | feed-parser-interface | 1 | 02-02 | KPI-10 |
| 02-04 | csv-parser-core | 2 | 02-05 | IN-03, IN-04, IN-05, IN-06, IN-07, IN-11, IN-13, TEST-01 |
| 02-05 | db-writer-atomic-swap | 2 | 02-04 | IN-09, IN-10 |
| 02-06 | orchestrator-and-cli | 3 | — | IN-03, IN-12, OBS-01 |

---

## Dependency Graph

```
Phase 1 (Foundation + DB pool already wired)
     │
     ├──► 02-02: schema-and-migration  ──────────────────────────────────────────────┐
     │    (stock_rows full schema,                                                    │
     │     stock_rows_staging, imports                                                │
     │     extended, new Drizzle migration)                                           │
     │                                                                                ▼
     ├──► 02-03: feed-parser-interface  ─────────────────────────────────────── 02-06: orchestrator-and-cli
     │    (FeedParser, ParsedRow,                                                    ▲   ▲
     │     IngestResult in packages/core)                                            │   │
     │                                                                               │   │
     ├──► 02-04: csv-parser-core  ─────────────────────────────────────────────────┘   │
     │    (parser.ts, schema.ts,                                                        │
     │     validator.ts, golden-file tests)                                             │
     │                                                                                   │
     └──► 02-05: db-writer-atomic-swap  ───────────────────────────────────────────────┘
          (writer.ts, batch insert, TRUNCATE+INSERT
           atomic swap, rollback tests)
```

**Wave structure:**

- **Wave 1 (parallel):** 02-02 and 02-03 — no runtime dependencies between them; each
  creates new files that Wave 2 depends on.
- **Wave 2 (parallel):** 02-04 and 02-05 — both depend only on Wave 1 outputs;
  02-04 uses the Drizzle schema types, 02-05 uses the staging table schema.
  They touch non-overlapping files.
- **Wave 3 (sequential):** 02-06 — wires 02-04 (parser) + 02-05 (writer) + 02-02
  (imports table) into the orchestrator and dev CLI.

---

## Pitfall Coverage

| Pitfall | Plan | Concrete Mitigation |
|---------|------|---------------------|
| #1 — Naive CSV parsing / decimal comma (EXTREME) | 02-04 | Schema-aware re-merge in `parser.ts`; golden-file assertions for articles 2, 58, 74, 174 |
| #2 — Windows-1252 encoding | 02-04 | `iconv-lite` `decodeStream('cp1252')` before csv-parse; umlaut + `µ` round-trip test |
| #10 — Partial import corruption | 02-05 | Permanent `stock_rows_staging` table + `BEGIN; TRUNCATE stock_rows; INSERT … FROM staging; COMMIT;` via Drizzle transaction; mock-DB rollback test |

---

## Performance Budget (IN-12)

- Target: 10k rows in < 60 seconds end-to-end.
- Strategy: Streaming pipeline (no full-file buffer). csv-parse emits rows one at a time;
  validated rows accumulate in memory only after the streaming pass. Drizzle inserts in
  batches of 500 rows per statement.
- Validation: Plan 02-06 generates a 10k-row synthetic fixture and asserts
  `elapsed < 60_000 ms` in the performance test. No Docker required — the test mocks
  the DB layer and only exercises the streaming parser + Zod path, which is the CPU-bound
  bottleneck.

---

## Exit Criteria (Full Phase)

```bash
# 1. Golden-file parse (no Docker)
npm -w apps/api test -- --reporter=verbose parser encoding schema validator

# 2. Atomicity rollback (no Docker)
npm -w apps/api test -- --reporter=verbose atomicity

# 3. Imports audit + pino logging (no Docker)
npm -w apps/api test -- --reporter=verbose orchestrator

# 4. Performance (10k rows, no Docker)
npm -w apps/api test -- --reporter=verbose performance

# 5. Full test suite
npm -w apps/api test

# 6. Dev CLI smoke test (requires live Postgres via DATABASE_URL)
npm -w apps/api run ingest:local -- samples/LagBes-sample.csv
# Expected output: INGEST_END { status: "success", rows_inserted: 12 }
```

---

## Files Owned by This Phase

```
apps/api/src/
  db/
    schema.ts                          (02-02: extended)
    migrations/                        (02-02: new migration file)
  ingest/
    index.ts                           (02-06)
    types.ts                           (02-04)
    schema.ts                          (02-04: Zod schema + column metadata)
    parser.ts                          (02-04)
    validator.ts                       (02-04)
    writer.ts                          (02-05)
    registry.ts                        (02-06)
    __tests__/
      parser.test.ts                   (02-04)
      encoding.test.ts                 (02-04)
      schema.test.ts                   (02-04)
      validator.test.ts                (02-04)
      atomicity.test.ts                (02-05)
      orchestrator.test.ts             (02-06)
      performance.test.ts              (02-06)
      mocks.ts                         (02-05)
  scripts/
    ingest-local.ts                    (02-06)
apps/api/package.json                  (02-02: add csv-parse, iconv-lite, uuid)

packages/core/src/
  ingest/
    types.ts                           (02-03: FeedParser, ParsedRow, IngestResult)
  index.ts                             (02-03: re-export ingest types)
```

---

*Phase 2 plans created: 2026-04-08*
