/**
 * apps/api/src/watcher/__tests__/stability.test.ts
 *
 * Unit tests for isSizeAndMtimeStable pure function.
 * Mocks node:fs/promises stat to control return values without real I/O.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs/promises before importing the module under test
vi.mock("node:fs/promises", () => ({
  stat: vi.fn(),
}));

import { isSizeAndMtimeStable } from "../stability.js";
import { stat } from "node:fs/promises";

// Use fake timers so setTimeout(resolve, windowMs) resolves instantly
vi.useFakeTimers();

describe("isSizeAndMtimeStable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when size and mtime are identical across two stat calls", async () => {
    const statMock = vi.mocked(stat);
    statMock.mockResolvedValue({
      size: 1234,
      mtimeMs: 1700000000000,
    } as ReturnType<typeof stat> extends Promise<infer T> ? T : never);

    const promise = isSizeAndMtimeStable("/mnt/smb/LagBes.csv", 1000);
    // Advance fake timers to skip the stability window delay
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(true);
    expect(statMock).toHaveBeenCalledTimes(2);
  });

  it("returns false when mtime changes between stat calls (same size)", async () => {
    const statMock = vi.mocked(stat);
    statMock
      .mockResolvedValueOnce({
        size: 1234,
        mtimeMs: 1700000000000,
      } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)
      .mockResolvedValueOnce({
        size: 1234,
        mtimeMs: 1700000001000,
      } as ReturnType<typeof stat> extends Promise<infer T> ? T : never);

    const promise = isSizeAndMtimeStable("/mnt/smb/LagBes.csv", 1000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(false);
  });

  it("returns false when size changes between stat calls", async () => {
    const statMock = vi.mocked(stat);
    statMock
      .mockResolvedValueOnce({
        size: 100,
        mtimeMs: 1700000000000,
      } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)
      .mockResolvedValueOnce({
        size: 200,
        mtimeMs: 1700000000000,
      } as ReturnType<typeof stat> extends Promise<infer T> ? T : never);

    const promise = isSizeAndMtimeStable("/mnt/smb/LagBes.csv", 1000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(false);
  });

  it("rejects with the fs error when stat throws (file disappeared)", async () => {
    const statMock = vi.mocked(stat);
    const fsError = Object.assign(new Error("ENOENT: no such file or directory"), {
      code: "ENOENT",
    });
    statMock.mockRejectedValue(fsError);

    // Attach rejection handler immediately before running timers to avoid
    // unhandled rejection warning from vitest's async timer machinery
    const promise = isSizeAndMtimeStable("/mnt/smb/LagBes.csv", 1000);
    // Register the catch handler before advancing timers
    const assertionPromise = expect(promise).rejects.toThrow("ENOENT");
    await vi.runAllTimersAsync();
    await assertionPromise;
  });
});
