"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users as UsersIcon,
  UsersMultiple,
  Calendar,
  FileText,
  TrendUp,
  Warning,
  Bell,
  Trophy,
  Soccer,
  ArrowRight,
  LayoutGrid,
} from "@/lib/icons";

// ─── Shape of GET /reports/overview (see reports.service.ts → overview()) ────────
// Everything is optional / defensively read so a partial payload still renders.

interface Overview {
  generatedAt?: string;
  revenue?: {
    invoices?: number;
    total?: number;
    paid?: number;
    outstanding?: number;
    byStatus?: { status: string; count: number; total: number; paid: number; outstanding: number }[];
  };
  memberships?: {
    byStatus?: { status: string; count: number }[];
    active?: number;
    expiringNext30Days?: number;
  };
  bookings?: {
    total?: number;
    last30Days?: number;
  };
  crm?: {
    totalContacts?: number;
    byStage?: { stage: string; count: number }[];
    overdueFollowUps?: number;
  };
  club?: {
    teams?: number;
    athletes?: number;
    upcomingEvents?: number;
  };
}

const SAR = (n: number | undefined | null): string =>
  `SAR ${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const num = (n: number | undefined | null): string => Number(n ?? 0).toLocaleString();

// Open pipeline = everything that isn't WON or LOST.
function openPipeline(byStage?: { stage: string; count: number }[]): number {
  if (!Array.isArray(byStage)) return 0;
  return byStage
    .filter((s) => !["WON", "LOST"].includes(String(s.stage || "").toUpperCase()))
    .reduce((sum, s) => sum + (s.count || 0), 0);
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] || "there";

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.reports
      .overview()
      .then((d: Overview) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const revenue = data?.revenue;
  const memberships = data?.memberships;
  const bookings = data?.bookings;
  const crm = data?.crm;
  const club = data?.club;

  const outstanding = revenue?.outstanding ?? 0;
  const overdueFollowUps = crm?.overdueFollowUps ?? 0;
  const expiring = memberships?.expiringNext30Days ?? 0;
  const pipeline = openPipeline(crm?.byStage);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Single pane of glass — live KPIs across billing, memberships, bookings, the sales pipeline and the club."
      />

      {error && (
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <Warning className="h-5 w-5 shrink-0 text-rose-500" />
            <div>
              <p className="font-medium text-rose-600 dark:text-rose-400">
                Couldn&apos;t load live metrics
              </p>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Loading />
      ) : (
        <>
          {/* Top row — money + the two things that need attention now */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total billed"
              value={SAR(revenue?.total)}
              hint={`${num(revenue?.invoices)} invoices · ${SAR(revenue?.paid)} paid`}
              hue="emerald"
              icon={<TrendUp className="h-6 w-6" />}
            />
            <StatCard
              label="Outstanding"
              value={SAR(outstanding)}
              hint={outstanding > 0 ? "Awaiting payment" : "All settled"}
              hue={outstanding > 0 ? "amber" : "navy"}
              icon={<FileText className="h-6 w-6" />}
            />
            <StatCard
              label="Active memberships"
              value={num(memberships?.active)}
              hint={expiring > 0 ? `${num(expiring)} expiring in 30 days` : "None expiring soon"}
              hue="yellow"
              icon={<UsersMultiple className="h-6 w-6" />}
            />
            <StatCard
              label="Open pipeline"
              value={num(pipeline)}
              hint={`${num(crm?.totalContacts)} contacts total`}
              hue="navy"
              icon={<UsersIcon className="h-6 w-6" />}
            />
          </div>

          {/* Second row — operational volume + club */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Bookings (30d)"
              value={num(bookings?.last30Days)}
              hint={`${num(bookings?.total)} all-time`}
              hue="navy"
              icon={<Calendar className="h-6 w-6" />}
            />
            <StatCard
              label="Overdue follow-ups"
              value={num(overdueFollowUps)}
              hint={overdueFollowUps > 0 ? "Needs attention" : "Nothing overdue"}
              hue={overdueFollowUps > 0 ? "rose" : "emerald"}
              icon={<Bell className="h-6 w-6" />}
            />
            <StatCard
              label="Teams / Athletes"
              value={`${num(club?.teams)} / ${num(club?.athletes)}`}
              hint="Academy club roster"
              hue="yellow"
              icon={<Soccer className="h-6 w-6" />}
            />
            <StatCard
              label="Upcoming events"
              value={num(club?.upcomingEvents)}
              hint="Scheduled ahead"
              hue="navy"
              icon={<Trophy className="h-6 w-6" />}
            />
          </div>

          {/* Pipeline breakdown + invoice status */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-4 py-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Sales pipeline</h3>
                  <Button variant="ghost" size="sm" render={<Link href="/crm/board" />}>
                    Open board
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
                {Array.isArray(crm?.byStage) && crm.byStage.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {crm.byStage.map((s) => (
                      <Badge key={s.stage} variant="outline" className="gap-1.5 py-1">
                        <span className="capitalize">{String(s.stage || "").toLowerCase()}</span>
                        <span className="font-semibold tabular-nums text-foreground">{s.count}</span>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No pipeline data yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 py-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Invoices by status</h3>
                  <Button variant="ghost" size="sm" render={<Link href="/billing/invoices" />}>
                    Open billing
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
                {Array.isArray(revenue?.byStatus) && revenue.byStatus.length > 0 ? (
                  <div className="space-y-2">
                    {revenue.byStatus.map((b) => (
                      <div
                        key={b.status}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {String(b.status || "").toLowerCase()}
                          </Badge>
                          <span className="text-muted-foreground">{b.count} invoices</span>
                        </span>
                        <span className="tabular-nums">
                          <span className="font-medium">{SAR(b.total)}</span>
                          {b.outstanding > 0 && (
                            <span className="ml-2 text-amber-500">{SAR(b.outstanding)} due</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No invoices yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick links into the rest of the control plane */}
          <Card>
            <CardContent className="flex flex-col gap-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Jump to
              </span>
              <Button variant="outline" size="sm" render={<Link href="/reports" />}>
                <LayoutGrid className="h-4 w-4" />
                Reports
              </Button>
              <Button variant="outline" size="sm" render={<Link href="/members" />}>
                <UsersMultiple className="h-4 w-4" />
                Members
              </Button>
              <Button variant="outline" size="sm" render={<Link href="/bookings" />}>
                <Calendar className="h-4 w-4" />
                Bookings
              </Button>
              <Button variant="outline" size="sm" render={<Link href="/billing/invoices" />}>
                <FileText className="h-4 w-4" />
                Invoices
              </Button>
              <Button variant="outline" size="sm" render={<Link href="/admin/apps" />}>
                <LayoutGrid className="h-4 w-4" />
                Connected apps
              </Button>
            </CardContent>
          </Card>

          {data?.generatedAt && (
            <p className="text-right text-xs text-muted-foreground">
              Updated {formatTime(data.generatedAt)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    </div>
  );
}
