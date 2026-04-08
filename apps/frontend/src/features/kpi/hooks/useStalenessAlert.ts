import { useEffect, useState } from "react";

/**
 * Staleness level returned by useStalenessAlert.
 *
 * - "none": data is fresh (< 30 minutes old) or no timestamp available
 * - "warning": data is 30–120 minutes old (yellow banner, CONTEXT.md)
 * - "critical": data is > 120 minutes (2 hours) old (red banner, CONTEXT.md)
 */
export type StalenessLevel = "none" | "warning" | "critical";

/**
 * Pure hook that computes how stale `lastUpdatedAt` is relative to now.
 * Re-evaluates every 10 seconds via setInterval.
 *
 * Thresholds are LOCKED in CONTEXT.md:
 * - > 30 minutes → "warning" (yellow)
 * - > 120 minutes → "critical" (red)
 *
 * @param lastUpdatedAt ISO 8601 timestamp string or null
 */
export function useStalenessAlert(lastUpdatedAt: string | null): StalenessLevel {
  const [level, setLevel] = useState<StalenessLevel>("none");

  useEffect(() => {
    if (!lastUpdatedAt) {
      setLevel("none");
      return;
    }

    const check = () => {
      const minutesOld = (Date.now() - new Date(lastUpdatedAt).getTime()) / 1000 / 60;
      if (minutesOld > 120) {
        setLevel("critical");
      } else if (minutesOld > 30) {
        setLevel("warning");
      } else {
        setLevel("none");
      }
    };

    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, [lastUpdatedAt]);

  return level;
}
