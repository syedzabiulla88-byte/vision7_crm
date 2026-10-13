"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import type { TrainerReport, TrainerReportRow, TrainerSide } from "@/lib/api";
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
  ChartCard,
  Kpi,
  RangeValue,
  ReportShell,
  SectionTitle,
  downloadCsv,
  formatSAR,
  useRangeQuery,
} from "../_shared";

/** Academy staff are coaches; Leisure staff are personal trainers. */
const SIDE_LABEL: Record<TrainerSide, { who: string; heading: string }> = {
  ACADEMY: { who: "Coach", heading: "Academy — coaches" },
  LEISURE: { who: "Personal trainer", heading: "Leisure — personal trainers" },
};

export default function TrainersReportPage() {
  const [range, setRange] = useState<RangeValue>("90d");
  const params = useRangeQuery(range);
  const [data, setData] = useState<TrainerReport | null>(null);
  const [loading, setLoading] = useState(true);

  // Deliberately no synchronous setState here: setting `loading` on the way in
  // trips react-hooks/set-state-in-effect, and keeping the previous table on
  // screen while a new range loads reads better than flashing a skeleton.
  useEffect(() => {
    let cancelled = false;
    api.reports
      .trainers(params)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const bySide = useMemo(
    () => ({
      ACADEMY: (data?.rows ?? []).filter((r: TrainerReportRow) => r.side === "ACADEMY"),
      LEISURE: (data?.rows ?? []).filter((r: TrainerReportRow) => r.side === "LEISURE"),
    }),
    [data],
  );

  const onDownload = () => {
    if (!data) return;
    downloadCsv("trainers-and-coaches", [
      ...data.rows.map((r) => ({
        side: r.side === "ACADEMY" ? "Academy (coach)" : "Leisure (personal trainer)",
        name: r.trainerName,
        sessionsDelivered: r.sessionsDelivered,
        sessionsCancelled: r.sessionsCancelled,
        sessionRevenue: r.sessionRevenue,
        membersAssigned: r.membersAssigned,
        activeMembers: r.activeMembers,
        sessionsAllocated: r.sessionsAllocated,
        sessionsRemaining: r.sessionsRemaining,
      })),
      {
        side: "TOTAL",
        name: "",
        sessionsDelivered: data.totals.sessionsDelivered,
        sessionsCancelled: data.totals.sessionsCancelled,
        sessionRevenue: data.totals.sessionRevenue,
        membersAssigned: data.totals.membersAssigned,
        activeMembers: data.totals.activeMembers,
        sessionsAllocated: data.totals.sessionsAllocated,
        sessionsRemaining: data.totals.sessionsRemaining,
      },
    ]);
  };

  return (
    <ReportShell
      title="Trainers & Coaches"
      subtitle="Per person: personal-training sessions delivered in range and the members currently assigned to them. Academy staff are listed as coaches, Leisure staff as personal trainers."
      range={range}
      onChangeRange={setRange}
      onDownload={data ? onDownload : undefined}
    >
      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Could not load this report.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Sessions delivered" value={data.totals.sessionsDelivered} />
            <Kpi label="Session revenue" value={formatSAR(data.totals.sessionRevenue)} hue="accent" />
            <Kpi label="Members assigned" value={data.totals.membersAssigned} />
            <Kpi
              label="Sessions remaining"
              value={data.totals.sessionsRemaining}
              sub="Across assigned packs"
            />
          </div>

          {(["ACADEMY", "LEISURE"] as TrainerSide[]).map((side) => {
            const rows = bySide[side];
            const totals = side === "ACADEMY" ? data.academy : data.leisure;
            return (
              <div key={side} className="space-y-3">
                <SectionTitle>{SIDE_LABEL[side].heading}</SectionTitle>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nobody assigned on this side for the selected range.
                  </p>
                ) : (
                  <ChartCard>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{SIDE_LABEL[side].who}</TableHead>
                          <TableHead className="text-right">Sessions</TableHead>
                          <TableHead className="text-right">Cancelled</TableHead>
                          <TableHead className="text-right">Session revenue</TableHead>
                          <TableHead className="text-right">Members</TableHead>
                          <TableHead className="text-right">Active</TableHead>
                          <TableHead className="text-right">Allocated</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={`${r.side}:${r.trainerId}`}>
                            <TableCell className="font-medium">{r.trainerName}</TableCell>
                            <TableCell className="text-right">{r.sessionsDelivered}</TableCell>
                            <TableCell className="text-right">{r.sessionsCancelled}</TableCell>
                            <TableCell className="text-right">{formatSAR(r.sessionRevenue)}</TableCell>
                            <TableCell className="text-right">{r.membersAssigned}</TableCell>
                            <TableCell className="text-right">{r.activeMembers}</TableCell>
                            <TableCell className="text-right">{r.sessionsAllocated}</TableCell>
                            <TableCell className="text-right">{r.sessionsRemaining}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-semibold">
                          <TableCell>Total · {totals.trainers} people</TableCell>
                          <TableCell className="text-right">{totals.sessionsDelivered}</TableCell>
                          <TableCell className="text-right">{totals.sessionsCancelled}</TableCell>
                          <TableCell className="text-right">{formatSAR(totals.sessionRevenue)}</TableCell>
                          <TableCell className="text-right">{totals.membersAssigned}</TableCell>
                          <TableCell className="text-right">{totals.activeMembers}</TableCell>
                          <TableCell className="text-right">{totals.sessionsAllocated}</TableCell>
                          <TableCell className="text-right">{totals.sessionsRemaining}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </ChartCard>
                )}
              </div>
            );
          })}

          <p className="text-xs text-muted-foreground">
            Sessions and revenue cover personal-training bookings in the selected range. Members,
            allocated and remaining are a live snapshot of assignments — session packs carry no date,
            so they do not move with the range.
          </p>
        </>
      )}
    </ReportShell>
  );
}
