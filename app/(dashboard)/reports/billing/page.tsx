"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ReportShell,
  Kpi,
  BarList,
  SectionTitle,
  ChartCard,
  downloadCsv,
  useRangeQuery,
  formatSAR,
  formatDate,
  type RangeValue,
} from "../_shared";

interface BillingReport {
  totals: { invoices: number; total: number; paid: number; outstanding: number };
  byStatus: { status: string; count: number; total: number; outstanding: number }[];
  byMonth: { month: string; count: number; total: number; paid: number }[];
  topPayers: { name: string; email?: string | null; count: number; total: number }[];
  recentPaid: { id: string; number: string; customer: string; paidAt?: string | null; total: number }[];
}

export default function BillingReportPage() {
  const [range, setRange] = useState<RangeValue>("90d");
  const params = useRangeQuery(range);
  const [data, setData] = useState<BillingReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.reports
      .billing(params)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const csv = () => {
    if (!data) return;
    downloadCsv(
      `billing-${range}.csv`,
      data.byMonth.map((m) => ({
        month: m.month,
        invoices: m.count,
        total: m.total,
        paid: m.paid,
      })),
    );
  };

  return (
    <ReportShell
      title="Billing"
      subtitle="Detailed view of invoices created in the period — totals, payment status, monthly trend, top payers."
      range={range}
      onChangeRange={setRange}
      onDownload={data ? csv : undefined}
    >
      {loading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Invoices issued" value={data.totals.invoices} />
            <Kpi label="Total billed" value={formatSAR(data.totals.total)} hue="accent" />
            <Kpi label="Paid" value={formatSAR(data.totals.paid)} hue="good" />
            <Kpi
              label="Outstanding"
              value={formatSAR(data.totals.outstanding)}
              hue={data.totals.outstanding > 0 ? "warn" : "default"}
            />
          </div>

          <SectionTitle>By status</SectionTitle>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChartCard>
              <BarList rows={data.byStatus.map((b) => ({ key: b.status, count: b.count }))} valueKey="count" />
            </ChartCard>
            <ChartCard>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#FFCF01]">
                Status totals
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byStatus.map((b) => (
                    <TableRow key={b.status}>
                      <TableCell>{b.status}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{b.count}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatSAR(b.total)}
                      </TableCell>
                      <TableCell className="text-right text-[#FFCF01]">
                        {formatSAR(b.outstanding)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ChartCard>
          </div>

          <SectionTitle>Monthly trend</SectionTitle>
          {data.byMonth.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data in range.</p>
          ) : (
            <ChartCard>
              <BarList
                rows={data.byMonth.map((m) => ({ key: m.month, value: m.total }))}
                valueKey="value"
                format={(v) => formatSAR(v)}
              />
            </ChartCard>
          )}

          <SectionTitle>Top payers</SectionTitle>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Lifetime paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topPayers.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.email || "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{p.count}</TableCell>
                    <TableCell className="text-right text-[#FFCF01]">{formatSAR(p.total)}</TableCell>
                  </TableRow>
                ))}
                {data.topPayers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No paid invoices in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <SectionTitle>Recent paid</SectionTitle>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Paid at</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentPaid.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.number}
                    </TableCell>
                    <TableCell>{r.customer}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.paidAt ? formatDate(r.paidAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-emerald-500">{formatSAR(r.total)}</TableCell>
                  </TableRow>
                ))}
                {data.recentPaid.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No recently paid invoices.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </ReportShell>
  );
}

function Loading() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
