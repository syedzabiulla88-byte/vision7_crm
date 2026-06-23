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
  type BarRow,
} from "../_shared";

interface BookingsReport {
  total: number;
  revenue: number;
  byStatus: { status: string; count: number }[];
  byGender: BarRow[];
  byHour: { hour: number; count: number }[];
  byDayOfWeek: { day: string; count: number }[];
  byFacility: { id: string; name: string; category: string; count: number; revenue: number }[];
  recent: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    facility?: string | null;
    customerName: string;
    status: string;
    totalPrice?: number | null;
  }[];
}

export default function BookingsReportPage() {
  const [range, setRange] = useState<RangeValue>("90d");
  const params = useRangeQuery(range);
  const [data, setData] = useState<BookingsReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.reports
      .bookings(params)
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
      `bookings-${range}.csv`,
      data.byFacility.map((f) => ({
        facility: f.name,
        category: f.category,
        bookings: f.count,
        revenue: f.revenue,
      })),
    );
  };

  const confirmed = data?.byStatus.find((s) => s.status === "CONFIRMED")?.count || 0;
  const cancelled = data?.byStatus.find((s) => s.status === "CANCELLED")?.count || 0;

  return (
    <ReportShell
      title="Bookings"
      subtitle="Volume + revenue across facilities, status, hour-of-day, day-of-week, gender."
      range={range}
      onChangeRange={setRange}
      onDownload={data ? csv : undefined}
    >
      {loading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Total bookings" value={data.total} />
            <Kpi label="Revenue (excl. cancelled)" value={formatSAR(data.revenue)} hue="accent" />
            <Kpi label="Confirmed" value={confirmed} hue="good" />
            <Kpi label="Cancelled" value={cancelled} hue={cancelled > 0 ? "warn" : "default"} />
          </div>

          <SectionTitle>By facility</SectionTitle>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byFacility.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-xs uppercase tracking-widest text-muted-foreground">
                      {f.category}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{f.count}</TableCell>
                    <TableCell className="text-right text-[#FFCF01]">{formatSAR(f.revenue)}</TableCell>
                  </TableRow>
                ))}
                {data.byFacility.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No bookings in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <SectionTitle>Status</SectionTitle>
              <ChartCard>
                <BarList rows={data.byStatus.map((s) => ({ key: s.status, count: s.count }))} />
              </ChartCard>
            </div>
            <div className="space-y-3">
              <SectionTitle>Gender</SectionTitle>
              <ChartCard>
                <BarList rows={data.byGender} />
              </ChartCard>
            </div>
            <div className="space-y-3">
              <SectionTitle>By hour of day</SectionTitle>
              <ChartCard>
                <BarList rows={data.byHour.map((h) => ({ key: `${h.hour}:00`, count: h.count }))} />
              </ChartCard>
            </div>
            <div className="space-y-3">
              <SectionTitle>By day of week</SectionTitle>
              <ChartCard>
                <BarList rows={data.byDayOfWeek.map((d) => ({ key: d.day, count: d.count }))} />
              </ChartCard>
            </div>
          </div>

          <SectionTitle>Recent bookings</SectionTitle>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Facility</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-muted-foreground">{formatDate(b.date)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {b.startTime}–{b.endTime}
                    </TableCell>
                    <TableCell>{b.facility || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{b.customerName}</TableCell>
                    <TableCell className="text-xs uppercase text-muted-foreground">{b.status}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {b.totalPrice ? formatSAR(b.totalPrice) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {data.recent.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                      No bookings in this range.
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}
