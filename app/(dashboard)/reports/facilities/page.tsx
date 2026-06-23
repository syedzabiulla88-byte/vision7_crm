"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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

interface FacilityReportRow {
  id: string;
  name: string;
  category: string;
  bookable: boolean;
  isActive: boolean;
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  slotsPerDay: number;
  possibleSlots: number;
  utilisationPct: number;
  revenue: number;
}

interface FacilitiesReport {
  facilities: FacilityReportRow[];
}

export default function FacilitiesReportPage() {
  const [range, setRange] = useState<RangeValue>("90d");
  const params = useRangeQuery(range);
  const [data, setData] = useState<FacilitiesReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.reports
      .facilities(params)
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
      `facilities-${range}.csv`,
      data.facilities.map((f) => ({
        name: f.name,
        category: f.category,
        bookings: f.totalBookings,
        confirmed: f.confirmedBookings,
        cancelled: f.cancelledBookings,
        revenue: f.revenue,
        utilisationPct: f.utilisationPct,
        possibleSlots: f.possibleSlots,
      })),
    );
  };

  return (
    <ReportShell
      title="Facilities"
      subtitle="Each bookable unit ranked by revenue + utilisation against its open hours."
      range={range}
      onChangeRange={setRange}
      onDownload={data ? csv : undefined}
    >
      {loading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Kpi label="Active facilities" value={data.facilities.filter((f) => f.isActive).length} />
            <Kpi
              label="Total bookings"
              value={data.facilities.reduce((s, f) => s + f.totalBookings, 0)}
            />
            <Kpi
              label="Revenue"
              value={formatSAR(data.facilities.reduce((s, f) => s + f.revenue, 0))}
              hue="accent"
            />
          </div>

          <SectionTitle>Per facility</SectionTitle>
          <div className="space-y-3">
            {data.facilities.map((f) => {
              const barHue =
                f.utilisationPct >= 70
                  ? "bg-emerald-500"
                  : f.utilisationPct >= 40
                    ? "bg-amber-500"
                    : "bg-rose-500";
              return (
                <Card key={f.id}>
                  <CardContent className="p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold">{f.name}</h3>
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                          {f.category} · {f.bookable ? "bookable" : "internal"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-semibold text-[#FFCF01]">{formatSAR(f.revenue)}</p>
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                          revenue
                        </p>
                      </div>
                    </div>
                    <div className="mb-4 grid grid-cols-3 gap-3 text-xs md:grid-cols-5">
                      <Mini label="Bookings" value={f.totalBookings} />
                      <Mini label="Confirmed" value={f.confirmedBookings} />
                      <Mini label="Cancelled" value={f.cancelledBookings} />
                      <Mini label="Slots/day" value={f.slotsPerDay} />
                      <Mini label="Utilisation" value={`${f.utilisationPct}%`} highlight />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full", barHue)}
                        style={{ width: `${Math.min(100, f.utilisationPct)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.confirmedBookings} of {f.possibleSlots} possible slots booked.
                    </p>
                  </CardContent>
                </Card>
              );
            })}
            {data.facilities.length === 0 && (
              <p className="text-sm text-muted-foreground">No facilities configured yet.</p>
            )}
          </div>
        </div>
      )}
    </ReportShell>
  );
}

function Mini({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold", highlight ? "text-[#FFCF01]" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}
