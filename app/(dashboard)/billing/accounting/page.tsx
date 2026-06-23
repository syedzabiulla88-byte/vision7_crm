"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendUp,
  Chart as ChartIcon,
  Warning,
  Calendar,
  Trophy,
  ArrowRight,
} from "@/lib/icons";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatSAR(value?: number | string | null): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `SAR ${safe.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Types (API payloads are loose `any`) ───────────────────────────────────────

interface AccountingOverview {
  totalRevenue?: number;
  yearRevenue?: number;
  monthRevenue?: number;
  outstandingAmount?: number;
  unpaidCount?: number;
  overdueCount?: number;
}

interface MonthBucket {
  month: number;
  label: string;
  revenue: number;
}

interface PlanRow {
  name: string;
  revenue: number;
  members: number;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [revenueByMonth, setRevenueByMonth] = useState<any[]>([]);
  const [topPlans, setTopPlans] = useState<any[]>([]);
  const [expirations, setExpirations] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [ov, rev, tp, exp] = await Promise.all([
          api.accounting.overview().catch(() => null),
          api.accounting.revenueByMonth(year).catch(() => []),
          api.accounting.topPlans(5).catch(() => []),
          api.accounting.upcomingExpirations(60).catch(() => []),
        ]);
        if (cancelled) return;
        setOverview(ov);
        setRevenueByMonth(Array.isArray(rev) ? rev : []);
        setTopPlans(Array.isArray(tp) ? tp : []);
        setExpirations(Array.isArray(exp) ? exp : []);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load accounting data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [year]);

  // Normalise revenue data to 12 buckets indexed 0..11.
  const normalizedMonths = useMemo<MonthBucket[]>(() => {
    const buckets: MonthBucket[] = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: MONTHS[i],
      revenue: 0,
    }));
    for (const row of revenueByMonth) {
      let idx: number | undefined;
      if (row?.month != null) {
        idx = Number(row.month) - 1;
      } else if (row?.monthIndex != null) {
        idx = Number(row.monthIndex);
      } else if (row?.date) {
        idx = new Date(row.date).getMonth();
      }
      if (idx != null && idx >= 0 && idx < 12) {
        buckets[idx].revenue = Number(row.revenue ?? row.total ?? row.amount ?? 0);
      }
    }
    return buckets;
  }, [revenueByMonth]);

  const peakRevenue = useMemo(
    () => Math.max(0, ...normalizedMonths.map((m) => m.revenue)),
    [normalizedMonths],
  );

  // Top plans, normalised to a stable {name, revenue, members} shape for the chart.
  const planRows = useMemo<PlanRow[]>(
    () =>
      topPlans.map((p) => ({
        name: p?.name ?? p?.planName ?? "—",
        revenue: Number(p?.revenue ?? p?.total ?? 0),
        members: Number(p?.memberCount ?? p?.members ?? p?.count ?? 0),
      })),
    [topPlans],
  );

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = currentYear; y >= currentYear - 4; y--) out.push(y);
    return out;
  }, [currentYear]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting"
        description="Revenue performance, outstanding balances and membership churn at a glance."
        actions={
          <Select
            items={years.map((y) => ({ value: String(y), label: String(y) }))}
            value={String(year)}
            onValueChange={(v) => setYear(Number(v ?? currentYear))}
          >
            <SelectTrigger className="w-32" aria-label="Select year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-3 h-7 w-28" />
                <Skeleton className="mt-3 h-3 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              label="Total Revenue"
              value={formatSAR(overview?.totalRevenue)}
              hint="All time"
              hue="emerald"
              icon={<TrendUp className="h-5 w-5" />}
            />
            <StatCard
              label="This Year"
              value={formatSAR(overview?.yearRevenue)}
              hint={String(currentYear)}
              hue="navy"
              icon={<ChartIcon className="h-5 w-5" />}
            />
            <StatCard
              label="This Month"
              value={formatSAR(overview?.monthRevenue)}
              hint="Current month"
              hue="yellow"
              icon={<Calendar className="h-5 w-5" />}
            />
            <StatCard
              label="Outstanding"
              value={formatSAR(overview?.outstandingAmount)}
              hint={`${overview?.unpaidCount ?? 0} unpaid · ${overview?.overdueCount ?? 0} overdue`}
              hue="rose"
              icon={<Warning className="h-5 w-5" />}
            />
          </>
        )}
      </div>

      {/* Revenue by month */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Revenue by Month — {year}</CardTitle>
            <p className="text-xs text-muted-foreground">Peak: {formatSAR(peakRevenue)}</p>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={288}>
              <BarChart data={normalizedMonths} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,207,1,0.08)" }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--popover-foreground)",
                  }}
                  labelStyle={{ color: "var(--popover-foreground)", fontWeight: 600 }}
                  formatter={(value) => [formatSAR(Number(value)), "Revenue"]}
                />
                <Bar dataKey="revenue" fill="#FFCF01" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top plans */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-[#FFCF01]" />
              <CardTitle>Top Plans by Revenue</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-60 w-full" />
            ) : planRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No plan revenue yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, planRows.length * 56)}>
                <BarChart
                  layout="vertical"
                  data={planRows}
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={120}
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,207,1,0.08)" }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--popover-foreground)",
                    }}
                    labelStyle={{ color: "var(--popover-foreground)", fontWeight: 600 }}
                    formatter={(value, _name, item: any) => [
                      `${formatSAR(Number(value))} · ${item?.payload?.members ?? 0} member${
                        item?.payload?.members === 1 ? "" : "s"
                      }`,
                      "Revenue",
                    ]}
                  />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {planRows.map((_, idx) => (
                      <Cell key={idx} fill="#FFCF01" fillOpacity={idx === 0 ? 1 : 0.55} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Upcoming expirations */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#FFCF01]" />
                <CardTitle>Expiring in 60 Days</CardTitle>
              </div>
              <Link
                href="/members"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : expirations.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No memberships expiring soon.
              </p>
            ) : (
              <div className="max-h-96 divide-y divide-border overflow-y-auto pr-1">
                {expirations.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 py-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-[10px] font-semibold">
                        {(m.athlete?.firstName?.charAt(0) || "?").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {m.athlete
                          ? `${m.athlete.firstName} ${m.athlete.lastName ?? ""}`.trim()
                          : "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.plan?.name || "—"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Ends
                      </p>
                      <p className="text-xs font-medium">{formatDate(m.endDate)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
