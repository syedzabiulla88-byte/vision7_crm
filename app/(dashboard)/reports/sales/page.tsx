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
  SectionTitle,
  downloadCsv,
  useRangeQuery,
  formatSAR,
  type RangeValue,
} from "../_shared";

interface SalesRow {
  salesUserId?: string | null;
  salesUserName: string;
  invoices: number;
  memberships: number;
  billed: number;
  collected: number;
  outstanding: number;
}

interface SalesReport {
  rows: SalesRow[];
  totals: {
    invoices: number;
    memberships: number;
    billed: number;
    collected: number;
    outstanding: number;
  };
}

export default function SalesReportPage() {
  const [range, setRange] = useState<RangeValue>("90d");
  const params = useRangeQuery(range);
  const [data, setData] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.reports
      .sales(params)
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
    downloadCsv(`sales-by-rep-${range}.csv`, [
      ...data.rows.map((r) => ({
        salesperson: r.salesUserName,
        invoices: r.invoices,
        memberships: r.memberships,
        billed: r.billed,
        collected: r.collected,
        outstanding: r.outstanding,
      })),
      {
        salesperson: "TOTAL",
        invoices: data.totals.invoices,
        memberships: data.totals.memberships,
        billed: data.totals.billed,
        collected: data.totals.collected,
        outstanding: data.totals.outstanding,
      },
    ]);
  };

  return (
    <ReportShell
      title="Sales by Salesperson"
      subtitle="Every invoice in range credited to the rep picked at assignment / invoicing."
      range={range}
      onChangeRange={setRange}
      onDownload={data?.rows?.length ? csv : undefined}
    >
      {loading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Invoices" value={data.totals.invoices} />
            <Kpi label="Billed" value={formatSAR(data.totals.billed)} />
            <Kpi label="Collected" value={formatSAR(data.totals.collected)} hue="accent" />
            <Kpi label="Outstanding" value={formatSAR(data.totals.outstanding)} />
          </div>

          <SectionTitle>Per salesperson</SectionTitle>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salesperson</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Memberships</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.salesUserId || "unassigned"}>
                    <TableCell className="font-medium">{r.salesUserName}</TableCell>
                    <TableCell className="text-right">{r.invoices}</TableCell>
                    <TableCell className="text-right">{r.memberships}</TableCell>
                    <TableCell className="text-right">{formatSAR(r.billed)}</TableCell>
                    <TableCell className="text-right">{formatSAR(r.collected)}</TableCell>
                    <TableCell className="text-right">{formatSAR(r.outstanding)}</TableCell>
                  </TableRow>
                ))}
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No invoices in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            &quot;Unassigned&quot; collects invoices raised without a sales person. Set the rep in
            the assign-membership dialogs or on the invoice form; it can also be changed after
            payment from the invoice edit screen.
          </p>
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
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
