"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { ScoreDistribution } from "@/lib/types/app.types";

interface Props {
  data: ScoreDistribution[];
}

const COLORS = ["#9ca3af", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];

export default function ScoreDistributionChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
        Distribución de puntuaciones
      </p>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="score"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "12px",
            }}
            formatter={(value) => [`${value} licitaciones`, "Total"]}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((entry) => (
              <Cell key={`cell-${entry.score}`} fill={COLORS[entry.score] ?? "#9ca3af"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
