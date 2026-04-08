import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStalenessAlert } from "../hooks/useStalenessAlert.js";

describe("useStalenessAlert", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "none" when lastUpdatedAt is null', () => {
    const { result } = renderHook(() => useStalenessAlert(null));
    expect(result.current).toBe("none");
  });

  it('returns "none" when data is less than 30 minutes old', () => {
    const now = new Date("2026-04-08T12:00:00Z").getTime();
    vi.setSystemTime(now);
    const twentyMinutesAgo = new Date(now - 20 * 60 * 1000).toISOString();

    const { result } = renderHook(() => useStalenessAlert(twentyMinutesAgo));
    expect(result.current).toBe("none");
  });

  it('returns "warning" when data is 31 minutes old', () => {
    const now = new Date("2026-04-08T12:00:00Z").getTime();
    vi.setSystemTime(now);
    const thirtyOneMinutesAgo = new Date(now - 31 * 60 * 1000).toISOString();

    const { result } = renderHook(() => useStalenessAlert(thirtyOneMinutesAgo));
    expect(result.current).toBe("warning");
  });

  it('returns "critical" when data is 2 hours and 1 minute old', () => {
    const now = new Date("2026-04-08T12:00:00Z").getTime();
    vi.setSystemTime(now);
    const twoHoursOneMomentAgo = new Date(now - (120 * 60 + 60) * 1000).toISOString();

    const { result } = renderHook(() => useStalenessAlert(twoHoursOneMomentAgo));
    expect(result.current).toBe("critical");
  });

  it('returns "warning" at exactly 31 minutes (not yet critical)', () => {
    const now = new Date("2026-04-08T12:00:00Z").getTime();
    vi.setSystemTime(now);
    // 90 minutes — above 30min threshold, below 120min threshold
    const ninetyMinutesAgo = new Date(now - 90 * 60 * 1000).toISOString();

    const { result } = renderHook(() => useStalenessAlert(ninetyMinutesAgo));
    expect(result.current).toBe("warning");
  });

  it("updates level after 10 seconds via setInterval", () => {
    const base = new Date("2026-04-08T12:00:00Z").getTime();
    // Start at 29 minutes old (none)
    const timestamp = new Date(base - 29 * 60 * 1000).toISOString();
    vi.setSystemTime(base);

    const { result } = renderHook(() => useStalenessAlert(timestamp));
    expect(result.current).toBe("none");

    // Advance 2 minutes → now 31 minutes old
    act(() => {
      vi.setSystemTime(base + 2 * 60 * 1000);
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe("warning");
  });

  it("clears interval on unmount", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const now = Date.now();
    vi.setSystemTime(now);

    const { unmount } = renderHook(() =>
      useStalenessAlert(new Date(now - 5 * 60 * 1000).toISOString()),
    );
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
