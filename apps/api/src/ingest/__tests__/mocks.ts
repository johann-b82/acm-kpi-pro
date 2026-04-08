// apps/api/src/ingest/__tests__/mocks.ts
import { vi } from "vitest";

/**
 * Creates a minimal mock Drizzle transaction client.
 * Use with vi.mock("../../../db/index.js") in atomicity tests.
 */
export function createMockTx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
    execute: vi.fn().mockResolvedValue(undefined),
    // Minimal sql tag mock
    sql: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createMockDb(txResult?: unknown) {
  return {
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const mockTx = createMockTx();
      return cb(mockTx);
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
    ...(txResult !== undefined ? { _txResult: txResult } : {}),
  };
}
