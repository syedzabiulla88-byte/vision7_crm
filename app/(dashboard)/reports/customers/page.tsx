"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ReportShell,
  Kpi,
  BarList,
  SectionTitle,
  ChartCard,
  downloadCsv,
  useRangeQuery,
  type RangeValue,
  type BarRow,
} from "../_shared";

interface CustomersReport {
  total: number;
  newInRange: number;
  withBookings: number;
  withInvoices: number;
  byStage: BarRow[];
  byType: BarRow[];
  bySource: BarRow[];
  byGender: BarRow[];
  topTags: { key: string; count: number }[];
}

export default function CustomersReportPage() {
  const [range, setRange] = useState<RangeValue>("90d");
  const params = useRangeQuery(range);
  const [data, setData] = useState<CustomersReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.reports
      .customers(params)
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
    downloadCsv(`customers-${range}.csv`, [
      ...data.byStage.map((r) => ({ category: "stage", ...r })),
      ...data.byType.map((r) => ({ category: "type", ...r })),
      ...data.bySource.map((r) => ({ category: "source", ...r })),
      ...data.byGender.map((r) => ({ category: "gender", ...r })),
    ]);
  };

  return (
    <ReportShell
      title="Customers"
      subtitle="Where leads come from, how the pipeline is shaped, who books and bills."
      range={range}
      onChangeRange={setRange}
      onDownload={data ? csv : undefined}
    >
      {loading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Total contacts" value={data.total} />
            <Kpi label="New in range" value={data.newInRange} hue="accent" />
            <Kpi label="With bookings" value={data.withBookings} hue="good" />
            <Kpi label="With invoices" value={data.withInvoices} hue="good" />
          </div>

          <SectionTitle>Pipeline stage</SectionTitle>
          <ChartCard>
            <BarList rows={data.byStage} />
          </ChartCard>

          <SectionTitle>Type</SectionTitle>
          <ChartCard>
            <BarList rows={data.byType} />
          </ChartCard>

          <SectionTitle>Source</SectionTitle>
          <ChartCard>
            <BarList rows={data.bySource} />
          </ChartCard>

          <SectionTitle>Gender mix</SectionTitle>
          <ChartCard>
            <BarList rows={data.byGender} />
          </ChartCard>

          <SectionTitle>Top tags</SectionTitle>
          <ChartCard>
            <div className="flex flex-wrap gap-2">
              {data.topTags.length === 0 && (
                <span className="text-sm text-muted-foreground">No tags yet.</span>
              )}
              {data.topTags.map((t) => (
                <Badge key={t.key} variant="outline" className="gap-1">
                  {t.key}
                  <span className="font-bold text-[#FFCF01]">·</span>
                  {t.count}
                </Badge>
              ))}
            </div>
          </ChartCard>
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
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}
