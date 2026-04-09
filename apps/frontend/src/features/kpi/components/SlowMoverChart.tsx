import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SlowMoverBucket } from "@acm-kpi/core";

interface SlowMoverChartProps {
  buckets: SlowMoverBucket[];
  clutterCount: number;
  samplesCount: number;
}

/**
 * Stacked horizontal bar chart showing Active / Slow / Dead stock by € value.
 *
 * Uses Recharts 3 with layout="vertical" for horizontal bar orientation.
 * Colors: Active=green, Slow=yellow, Dead=red.
 *
 * CONTEXT.md decision: stacked bar (not treemap) for executive dashboard.
 * DASH-06: slow-mover visualization.
 */
export function SlowMoverChart({ buckets, clutterCount, samplesCount }: SlowMoverChartProps) {
  // Format data for Recharts stacked bar
  const data = [
    {
      name: "Stock by Age",
      Active: buckets.find((b) => b.label === "active")?.value_eur ?? 0,
      Slow: buckets.find((b) => b.label === "slow")?.value_eur ?? 0,
      Dead: buckets.find((b) => b.label === "dead")?.value_eur ?? 0,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Slow Movers &amp; Dead Stock</CardTitle>
        <CardDescription>
          Value distribution by aging bucket (active &lt;6 mo · slow 6–12 mo · dead &gt;12 mo)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 10, right: 40, left: 20, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => `€${(v / 1_000_000).toFixed(1)}M`}
            />
            <YAxis dataKey="name" type="category" width={90} />
            <Tooltip
              formatter={(value) => `€${Number(value).toLocaleString()}`}
              contentStyle={{ backgroundColor: "rgba(255,255,255,0.95)" }}
            />
            <Legend />
            <Bar dataKey="Active" stackId="a" fill="#22c55e" name="Active" />
            <Bar dataKey="Slow" stackId="a" fill="#eab308" name="Slow" />
            <Bar dataKey="Dead" stackId="a" fill="#ef4444" name="Dead" />
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground">Clutter excluded</p>
            <p>{clutterCount.toLocaleString()} items (dead stock &lt;€100 each)</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Samples &amp; Tools excluded</p>
            <p>{samplesCount.toLocaleString()} items (WKZ / MUSTERRAUM)</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
