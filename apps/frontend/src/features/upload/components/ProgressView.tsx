import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "src/lib/utils";

interface ProgressViewProps {
  state: "uploading" | "parsing";
  percent: number;
  filename: string;
}

/**
 * UP-04: Two-stage upload progress.
 *
 * - `uploading`: determinate shadcn Progress bar (0–100). Radix Progress emits
 *   role="progressbar" + aria-valuenow automatically from the `value` prop.
 * - `parsing`:   indeterminate Loader2 spinner with aria-busy=true.
 *
 * Respects prefers-reduced-motion: reduce (spinner stops animating).
 * Outer wrapper has aria-live="polite" so screen readers announce transitions.
 */
export function ProgressView({ state, percent, filename }: ProgressViewProps) {
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      className="space-y-2"
      aria-live="polite"
      data-testid="progress-view"
    >
      {state === "uploading" ? (
        <>
          <Progress
            value={percent}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Uploading ${filename}`}
            className="h-1.5 w-full"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            Uploading {filename}… {percent}%
          </p>
        </>
      ) : (
        <div
          aria-busy="true"
          aria-label="Parsing and validating file"
          className="flex items-center gap-3"
        >
          <Loader2
            className={cn(
              "h-5 w-5 animate-spin text-primary",
              reducedMotion && "animate-none",
            )}
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            Parsing &amp; validating… this usually takes a second
          </p>
        </div>
      )}
    </div>
  );
}
