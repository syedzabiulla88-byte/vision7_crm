"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { api, type DashboardOverview } from "@/lib/api";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/hooks/use-permissions";
import { navForPermissions } from "@/lib/nav";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SalesByRepCard } from "./_sales-by-rep-card";
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

// Pinned to en-US rather than the viewer's browser locale — otherwise a
// browser set to e.g. en-IN renders Indian-style digit grouping
// (3,15,692) instead of the international format (315,692).
const SAR = (n: number | undefined | null): string =>
  `SAR ${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const num = (n: number | undefined | null): string => Number(n ?? 0).toLocaleString('en-US');

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

// ─── Jump-to destinations: shown only when the user can(perm) ─────────────────────
// Mirrors the card → destination contract; each breakdown CTA and the bottom bar
// reuse these so a button never links somewhere the user can't reach.
interface JumpTarget {
  perm: string;
  href: string;
  label: string;
  icon: ReactNode;
}

const JUMP: Record<string, JumpTarget> = {
  revenue: { perm: "invoices:view", href: "/billing/invoices", label: "Open billing", icon: <FileText className="h-4 w-4" /> },
  memberships: { perm: "memberships:view", href: "/members", label: "Open members", icon: <UsersMultiple className="h-4 w-4" /> },
  pipeline: { perm: "crm:view", href: "/crm/board", label: "Open board", icon: <UsersIcon className="h-4 w-4" /> },
  bookings: { perm: "bookings:view", href: "/bookings", label: "Open bookings", icon: <Calendar className="h-4 w-4" /> },
  followups: { perm: "followups:view", href: "/crm", label: "Open follow-ups", icon: <Bell className="h-4 w-4" /> },
  // No club/teams jump-to: the CRM control plane has no teams/athletes page
  // (that's the platform app's domain), so the Club card stays informational.
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const router = useRouter();
  const firstName = user?.name?.split(" ")[0] || "there";

  // A role without dashboard access (e.g. a content writer) lands on its first
  // permitted page instead of an empty dashboard that can only show a 403.
  const canDashboard = can("dashboard:view");
  const landing = canDashboard
    ? null
    : (navForPermissions(user?.permissions).flatMap((g) => g.items)[0]?.href ?? null);
  useEffect(() => {
    if (landing && landing !== "/") router.replace(landing);
  }, [landing, router]);

  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (landing) return; // redirecting away — nothing to load
    setLoading(true);
    setError(null);
    try {
      const d = await api.dashboard.overview();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [landing]);

  useEffect(() => {
    load();
  }, [load]);

  const revenue = data?.revenue;
  const memberships = data?.memberships;
  const pipeline = data?.pipeline;
  const bookings = data?.bookings;
  const followups = data?.followups;
  const club = data?.club;

  // ─── Card config — a card renders only when can(perm) AND its section exists ─────
  // StatCards are collected into the two 4-col grid rows; breakdown cards render in
  // the 2-col breakdown row. Everything derives from the config so gating stays in
  // one place.
  const outstanding = revenue?.outstanding ?? 0;
  const expiring = memberships?.expiringNext30Days ?? 0;
  const overdue = followups?.overdue ?? 0;

  const stats: ReactNode[] = [];

  if (can("dashboard:revenue") && revenue) {
    stats.push(
      <StatCard
        key="rev-total"
        label="Total billed"
        value={SAR(revenue.total)}
        hint={`${num(revenue.invoices)} invoices · ${SAR(revenue.paid)} paid`}
        hue="emerald"
        icon={<TrendUp className="h-6 w-6" />}
      />,
      <StatCard
        key="rev-outstanding"
        label="Outstanding"
        value={SAR(outstanding)}
        hint={outstanding > 0 ? "Awaiting payment" : "All settled"}
        hue={outstanding > 0 ? "amber" : "navy"}
        icon={<FileText className="h-6 w-6" />}
      />,
    );
  }

  if (can("dashboard:memberships") && memberships) {
    stats.push(
      <StatCard
        key="memberships"
        label="Active memberships"
        value={num(memberships.active)}
        hint={expiring > 0 ? `${num(expiring)} expiring in 30 days` : "None expiring soon"}
        hue="yellow"
        icon={<UsersMultiple className="h-6 w-6" />}
      />,
    );
  }

  // Expiry cards link to the matching Members chip when the viewer can open it.
  const membersLink = can(JUMP.memberships.perm);
  const expiryCard = (key: string, status: "EXPIRING" | "EXPIRED", card: ReactNode) =>
    membersLink ? (
      <Link
        key={key}
        href={`/members?status=${status}`}
        className="block rounded-xl transition hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {card}
      </Link>
    ) : (
      <div key={key}>{card}</div>
    );

  if (can("dashboard:memberships") && memberships && typeof memberships.expiringNext15Days === "number") {
    const soon = memberships.expiringNext15Days;
    stats.push(
      expiryCard(
        "expiring-15",
        "EXPIRING",
        <StatCard
          label="Expiring in 15 days"
          value={num(soon)}
          hint={soon > 0 ? "Active memberships ending soon — renew them" : "Nothing ending soon"}
          hue={soon > 0 ? "amber" : "emerald"}
          icon={<Calendar className="h-6 w-6" />}
          className="h-full"
        />,
      ),
    );
  }

  if (can("dashboard:memberships") && memberships && typeof memberships.expired === "number") {
    const gone = memberships.expired;
    stats.push(
      expiryCard(
        "expired",
        "EXPIRED",
        <StatCard
          label="Expired memberships"
          value={num(gone)}
          hint="Past their end date · all time"
          hue={gone > 0 ? "rose" : "emerald"}
          icon={<Warning className="h-6 w-6" />}
          className="h-full"
        />,
      ),
    );
  }

  if (can("dashboard:pipeline") && pipeline) {
    stats.push(
      <StatCard
        key="pipeline"
        label="Open pipeline"
        value={num(pipeline.open)}
        hint={`${num(pipeline.totalContacts)} contacts total`}
        hue="navy"
        icon={<UsersIcon className="h-6 w-6" />}
      />,
    );
  }

  if (can("dashboard:bookings") && bookings) {
    stats.push(
      <StatCard
        key="bookings"
        label="Bookings (30d)"
        value={num(bookings.last30Days)}
        hint={`${num(bookings.total)} all-time`}
        hue="navy"
        icon={<Calendar className="h-6 w-6" />}
      />,
    );
  }

  if (can("dashboard:followups") && followups) {
    stats.push(
      <StatCard
        key="followups"
        label="Overdue follow-ups"
        value={num(overdue)}
        hint={overdue > 0 ? `${num(followups.today)} due today` : "Nothing overdue"}
        hue={overdue > 0 ? "rose" : "emerald"}
        icon={<Bell className="h-6 w-6" />}
      />,
    );
  }

  if (can("dashboard:club") && club) {
    stats.push(
      <StatCard
        key="club-roster"
        label="Teams / Athletes"
        value={`${num(club.teams)} / ${num(club.athletes)}`}
        hint="Academy club roster"
        hue="yellow"
        icon={<Soccer className="h-6 w-6" />}
      />,
      <StatCard
        key="club-events"
        label="Upcoming events"
        value={num(club.upcomingEvents)}
        hint="Scheduled ahead"
        hue="navy"
        icon={<Trophy className="h-6 w-6" />}
      />,
    );
  }

  const showPipelineBreakdown = can("dashboard:pipeline") && !!pipeline;
  const showRevenueBreakdown = can("dashboard:revenue") && !!revenue;
  const hasCards = stats.length > 0 || showPipelineBreakdown || showRevenueBreakdown;

  // Bottom bar: only destinations the user can reach.
  const jumpTargets = Object.values(JUMP).filter((t) => can(t.perm));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Single pane of glass — live KPIs across billing, memberships, bookings, the sales pipeline and the club."
        onRefresh={load}
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
          {!hasCards && (
            <Card>
              <CardContent className="flex items-center gap-3 py-6 text-sm">
                <LayoutGrid className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">Your dashboard is empty</p>
                  <p className="text-muted-foreground">
                    Ask an administrator to enable dashboard cards for your role.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {stats.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats}</div>
          )}

          {/* Pipeline breakdown + invoice status */}
          {(showPipelineBreakdown || showRevenueBreakdown) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {showPipelineBreakdown && (
                <Card>
                  <CardContent className="space-y-4 py-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Sales pipeline</h3>
                      {can(JUMP.pipeline.perm) && (
                        <Button variant="ghost" size="sm" render={<Link href={JUMP.pipeline.href} />}>
                          {JUMP.pipeline.label}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {pipeline!.byStage.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {pipeline!.byStage.map((s) => (
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
              )}

              {showRevenueBreakdown && (
                <Card>
                  <CardContent className="space-y-4 py-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Invoices by status</h3>
                      {can(JUMP.revenue.perm) && (
                        <Button variant="ghost" size="sm" render={<Link href={JUMP.revenue.href} />}>
                          {JUMP.revenue.label}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {revenue!.byStatus.length > 0 ? (
                      <div className="space-y-2">
                        {revenue!.byStatus.map((b) => (
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
              )}
            </div>
          )}

          {/* Sales by salesperson — backed by /reports/sales, so gated on reports:view */}
          {can("reports:view") && <SalesByRepCard />}

          {/* Quick links — only destinations the user is permitted to reach */}
          {jumpTargets.length > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Jump to
                </span>
                {jumpTargets.map((t) => (
                  <Button
                    key={t.href}
                    variant="outline"
                    size="sm"
                    render={<Link href={t.href} />}
                  >
                    {t.icon}
                    {t.label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

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
