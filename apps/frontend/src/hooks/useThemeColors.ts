import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface ThemeColors {
  kpiOk: string;
  kpiWarn: string;
  kpiCritical: string;
  primary: string;
  border: string;
  foreground: string;
}

function readCSSVars(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const get = (v: string) => `hsl(${style.getPropertyValue(v).trim()})`;
  return {
    kpiOk: get("--kpi-ok"),
    kpiWarn: get("--kpi-warn"),
    kpiCritical: get("--kpi-critical"),
    primary: get("--primary"),
    border: get("--border"),
    foreground: get("--foreground"),
  };
}

/**
 * Returns theme-aware colors read from CSS variables at render time.
 * Re-evaluates when theme changes so Recharts charts re-render with correct colors.
 * (D-14, D-15: CSS variables are single source of truth — no hex literals in JS)
 */
export function useThemeColors(): ThemeColors {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<ThemeColors>(() => ({
    kpiOk: "hsl(132 61% 36%)",
    kpiWarn: "hsl(38 92% 38%)",
    kpiCritical: "hsl(0 84.2% 40%)",
    primary: "hsl(221.2 83.2% 53.3%)",
    border: "hsl(214.3 31.8% 91.4%)",
    foreground: "hsl(222.2 84% 4.9%)",
  }));

  useEffect(() => {
    // Re-read CSS variables after theme class change settles (requestAnimationFrame)
    const frame = requestAnimationFrame(() => setColors(readCSSVars()));
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  return colors;
}
