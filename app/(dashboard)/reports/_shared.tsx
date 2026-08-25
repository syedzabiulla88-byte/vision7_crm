"use client";

// Shared building blocks for the Reports area, ported from
// site/src/app/admin/reports/_shared.js into idiomatic TS + shadcn + Recharts.
//
//   - ReportShell:   page chrome with back link, title, date-range presets, CSV button
//   - Kpi:           label + big number stat tile (reuses shared StatCard)
//   - BarList:       horizontal bar chart (Recharts) from a list of rows
//   - SectionTitle:  small uppercase section heading
//   - downloadCsv:   client-side CSV export
//   - useRangeQuery: range preset -> { from, to } ISO window

import { ReactNode } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { ArrowLeft, Download } from "@/lib/icons";

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatSAR(n: number | string | null | undefined): string {
  const num = Number(n || 0);
  return `SAR ${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
}

// ─── Date-range presets ─────────────────────────────────────────────────────────

export type RangeValue = "30d" | "90d" | "180d" | "365d";

export const RANGE_PRESETS: { value: RangeValue; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "3 months" },
  { value: "180d", label: "6 months" },
  { value: "365d", label: "1 year" },
];

export const PRESET_DAYS: Record<RangeValue, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

/** Turn a range preset into the { from, to } ISO window the backend expects. */
export function useRangeQuery(range: RangeValue): { from: string; to: string } {
  const days = PRESET_DAYS[range] ?? 90;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ─── ReportShell ────────────────────────────────────────────────────────────────

interface ReportShellProps {
  title: string;
  subtitle?: string;
  range?: RangeValue;
  onChangeRange?: (range: RangeValue) => void;
  onDownload?: () => void;
  /** Extra actions rendered before the CSV button (e.g. run-digest). */
  actions?: ReactNode;
  children: ReactNode;
}

export function ReportShell({
  title,
  subtitle,
  range,
  onChangeRange,
  onDownload,
  actions,
  children,
}: ReportShellProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-[#FFCF01]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All reports
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#FFCF01]">Report</p>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onChangeRange && range && (
              <div className="inline-flex overflow-hidden rounded-md border border-border">
                {RANGE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => onChangeRange(p.value)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors",
                      range === p.value
                        ? "bg-[#FFCF01] text-[#011b2b]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            {actions}
            {onDownload && (
              <Button variant="outline" size="sm" onClick={onDownload}>
                <Download className="h-4 w-4" />
                CSV
              </Button>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── KPI tile ───────────────────────────────────────────────────────────────────

type KpiHue = "default" | "good" | "warn" | "bad" | "accent";

const KPI_HUE: Record<KpiHue, "navy" | "yellow" | "emerald" | "amber" | "rose"> = {
  default: "navy",
  good: "emerald",
  warn: "amber",
  bad: "rose",
  accent: "yellow",
};

export function Kpi({
  label,
  value,
  sub,
  hue = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  hue?: KpiHue;
}) {
  return <StatCard label={label} value={value ?? "—"} hint={sub} hue={KPI_HUE[hue]} />;
}

// ─── BarList (Recharts horizontal bar chart) ─────────────────────────────────────

export interface BarRow {
  key?: string;
  label?: string;
  count?: number | string;
  value?: number | string;
  [k: string]: unknown;
}

export function BarList({
  rows,
  valueKey = "count",
  labelKey = "key",
  format = (v: number) => String(v),
}: {
  rows: BarRow[];
  valueKey?: string;
  labelKey?: string;
  format?: (v: number) => string;
}) {
  const data = (rows || []).map((r) => ({
    label: String(r[labelKey] ?? "—"),
    value: Number(r[valueKey]) || 0,
  }));

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data.</p>;
  }

  // ~32px per row keeps thin bars readable; min height avoids cramped 1-row charts.
  const height = Math.max(120, data.length * 36 + 16);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
          barCategoryGap={8}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={130}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.3 }}
            formatter={(v) => [format(Number(v)), ""]}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
            labelStyle={{ color: "var(--popover-foreground)" }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} label={renderBarLabel(format)}>
            {data.map((_, i) => (
              <Cell key={i} fill="#FFCF01" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Right-aligned value label on each bar.
function renderBarLabel(format: (v: number) => string) {
  return (props: any) => {
    const { x, y, width, height, value } = props;
    return (
      <text
        x={x + width + 8}
        y={y + height / 2}
        dominantBaseline="middle"
        fontSize={11}
        fill="var(--muted-foreground)"
        fontFamily="var(--font-mono, monospace)"
      >
        {format(Number(value) || 0)}
      </text>
    );
  };
}

// ─── SectionTitle ─────────────────────────────────────────────────────────────

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-widest text-[#FFCF01]">{children}</h2>
  );
}

// ─── ChartCard: a Card wrapper for a chart/section body ───────────────────────────

export function ChartCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export { downloadCsv } from "@/lib/csv";
