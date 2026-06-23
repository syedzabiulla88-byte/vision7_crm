"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Bell } from "@/lib/icons";
import { ReportShell, Kpi, SectionTitle, downloadCsv } from "../_shared";

interface FollowUpRow {
  salesUserId?: string | null;
  salesUserName: string;
  total: number;
  completed: number;
  overdue: number;
  upcoming: number;
  completionRate: number;
}

interface FollowUpReport {
  totals: { total: number; completed: number; overdue: number; upcoming: number };
  rows: FollowUpRow[];
}

interface DigestResult {
  processed?: number;
  notificationsSent?: number;
  error?: string;
}

export default function FollowUpsReportPage() {
  const [data, setData] = useState<FollowUpReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [running, setRunning] = useState(false);

  const load = () => {
    setLoading(true);
    api.crm
      .followUpReport()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const runDigest = async () => {
    setRunning(true);
    try {
      const res = await api.crm.runFollowUpDigest();
      setDigest(res);
      toast.success(
        `Digest sent — processed ${res.processed ?? 0} follow-up(s), ${res.notificationsSent ?? 0} reminder(s) delivered.`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed";
      setDigest({ error: message });
      toast.error(`Digest failed: ${message}`);
    } finally {
      setRunning(false);
    }
  };

  const csv = () => {
    if (!data?.rows) return;
    downloadCsv(
      "sales-followups.csv",
      data.rows.map((r) => ({
        salesUser: r.salesUserName,
        total: r.total,
        completed: r.completed,
        overdue: r.overdue,
        upcoming: r.upcoming,
        completionRate: `${r.completionRate}%`,
      })),
    );
  };

  const t = data?.totals || { total: 0, completed: 0, overdue: 0, upcoming: 0 };

  return (
    <ReportShell
      title="Sales Follow-ups"
      subtitle="Per sales rep: assigned, completed, overdue and upcoming follow-ups, with completion rate."
      onDownload={data?.rows?.length ? csv : undefined}
      actions={
        <Button variant="outline" size="sm" onClick={runDigest} disabled={running}>
          <Bell className="h-4 w-4" />
          {running ? "Sending…" : "Run reminder digest"}
        </Button>
      }
    >
      {digest && (
        <div className="rounded-md border border-[#FFCF01]/30 bg-[#FFCF01]/5 px-4 py-3 text-sm">
          {digest.error
            ? `Digest failed: ${digest.error}`
            : `Digest sent — processed ${digest.processed ?? 0} follow-up(s), ${digest.notificationsSent ?? 0} reminder(s) delivered.`}
        </div>
      )}

      {loading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Total follow-ups" value={t.total} />
            <Kpi label="Completed" value={t.completed} hue="good" />
            <Kpi label="Overdue" value={t.overdue} hue={t.overdue > 0 ? "warn" : "default"} />
            <Kpi label="Upcoming" value={t.upcoming} hue="accent" />
          </div>

          <SectionTitle>By sales rep</SectionTitle>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales rep</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Upcoming</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No follow-ups yet.
                    </TableCell>
                  </TableRow>
                )}
                {data.rows.map((r) => (
                  <TableRow key={r.salesUserId || "unassigned"}>
                    <TableCell className="font-medium">{r.salesUserName}</TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell className="text-right text-emerald-500">{r.completed}</TableCell>
                    <TableCell className={cn("text-right", r.overdue > 0 && "text-rose-500")}>
                      {r.overdue}
                    </TableCell>
                    <TableCell className="text-right">{r.upcoming}</TableCell>
                    <TableCell className="text-right font-semibold text-[#FFCF01]">
                      {r.completionRate}%
                    </TableCell>
                  </TableRow>
                ))}
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
    </div>
  );
}
