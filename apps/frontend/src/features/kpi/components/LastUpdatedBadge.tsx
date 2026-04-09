interface LastUpdatedBadgeProps {
  /** ISO 8601 timestamp of the last successful import, or null */
  lastUpdatedAt: string | null;
}

/**
 * Small badge showing "Last updated: HH:MM".
 * Renders nothing when lastUpdatedAt is null.
 *
 * Uses toLocaleTimeString for formatting — Phase 6 will replace with
 * locale-specific formatting (de-DE) per CONTEXT.md.
 */
export function LastUpdatedBadge({ lastUpdatedAt }: LastUpdatedBadgeProps) {
  if (!lastUpdatedAt) return null;

  const time = new Date(lastUpdatedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <span className="text-xs text-muted-foreground">
      Last updated: {time}
    </span>
  );
}
