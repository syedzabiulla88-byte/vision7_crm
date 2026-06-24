"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, Warning } from "@/lib/icons";
import { formatSAR } from "../invoices/_shared";

// ─── Types (API payload is loose `any`) ────────────────────────────────────────

interface StatementRow {
  customer: string;
  contactId?: string | null;
  athleteId?: string | null;
  total: number;
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
}

interface StatementTotals {
  total: number;
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
}

interface StatementsReport {
  generatedAt?: string | null;
  rows: StatementRow[];
  totals: StatementTotals;
}

const EMPTY_TOTALS: StatementTotals = {
  total: 0,
  current: 0,
  d30: 0,
  d60: 0,
  d90: 0,
  d90plus: 0,
};

function formatUpdated(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })} ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function StatementsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatementsReport | null>(null);

  const load = () => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.reports
      .statements()
      .then((d: StatementsReport) => {
        if (cancelled) return;
        setData({
          generatedAt: d?.generatedAt ?? null,
          rows: Array.isArray(d?.rows) ? d.rows : [],
          totals: { ...EMPTY_TOTALS, ...(d?.totals || {}) },
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load statements");
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    const cleanup = load();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = data?.rows ?? [];
  const totals = data?.totals ?? EMPTY_TOTALS;

  return (
    <PermissionGate permission="reports:view">
      <div className="space-y-6">
        <PageHeader
          title="Statements"
          description={
            loading ? "Loading…" : `Updated ${formatUpdated(data?.generatedAt)}`
          }
          onRefresh={() => {
            load();
          }}
        />

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-2">
          {loading ? (
            <>
              <Card>
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-3 h-7 w-32" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-3 h-7 w-32" />
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <StatCard
                label="Total outstanding"
                value={formatSAR(totals.total)}
                hint="Across all customers"
                hue="yellow"
                icon={<FileText className="h-5 w-5" />}
              />
              <StatCard
                label="90+ days overdue"
                value={formatSAR(totals.d90plus)}
                hint="Oldest, highest-risk balances"
                hue="rose"
                icon={<Warning className="h-5 w-5" />}
              />
            </>
          )}
        </div>

        {/* Aging table */}
        <Card>
          <CardContent>
            {error ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Warning className="h-8 w-8 text-destructive" />
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" onClick={() => load()}>
                  Retry
                </Button>
              </div>
            ) : loading ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Total outstanding</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">1–30</TableHead>
                      <TableHead className="text-right">31–60</TableHead>
                      <TableHead className="text-right">61–90</TableHead>
                      <TableHead className="text-right">90+</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-6 w-6 text-muted-foreground" />}
                title="No outstanding balances"
                description="Everything settled — no customer currently owes a balance."
              />
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Total outstanding</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">1–30</TableHead>
                      <TableHead className="text-right">31–60</TableHead>
                      <TableHead className="text-right">61–90</TableHead>
                      <TableHead className="text-right">90+</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={r.contactId ?? r.athleteId ?? `${r.customer}-${i}`}>
                        <TableCell className="font-medium">
                          {r.contactId ? (
                            <Link
                              href={`/crm/${r.contactId}`}
                              className="hover:text-primary hover:underline"
                            >
                              {r.customer || "—"}
                            </Link>
                          ) : (
                            r.customer || "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-[#FFCF01]">
                          {formatSAR(r.total)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatSAR(r.current)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatSAR(r.d30)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatSAR(r.d60)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatSAR(r.d90)}
                        </TableCell>
                        <TableCell
                          className={
                            r.d90plus > 0
                              ? "text-right tabular-nums font-medium bg-red-500/10 text-red-600 dark:text-red-400"
                              : "text-right tabular-nums text-muted-foreground"
                          }
                        >
                          {formatSAR(r.d90plus)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">Totals</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-[#FFCF01]">
                        {formatSAR(totals.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatSAR(totals.current)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatSAR(totals.d30)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatSAR(totals.d60)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatSAR(totals.d90)}
                      </TableCell>
                      <TableCell
                        className={
                          totals.d90plus > 0
                            ? "text-right tabular-nums font-semibold bg-red-500/10 text-red-600 dark:text-red-400"
                            : "text-right tabular-nums font-semibold"
                        }
                      >
                        {formatSAR(totals.d90plus)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  );
}
