"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export { useAsync } from "@/components/hooks/use-async";

export const ATTRIBUTES = ["passing", "vision", "finishing", "dribbling", "control", "acceleration", "stamina", "concentration"];

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">{value ?? "—"}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{message}</p>;
}

export function Loading() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-2/3" />
    </div>
  );
}

/** 0–100 bars for the eight ESA Index attributes. */
export function AttributeBars({ values }: { values: Record<string, number | null | undefined> | null | undefined }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {ATTRIBUTES.map((a) => {
        const v = values?.[a];
        const pct = typeof v === "number" ? Math.max(0, Math.min(100, v)) : 0;
        return (
          <div key={a} className="space-y-0.5">
            <div className="flex justify-between text-xs capitalize">
              <span className="text-muted-foreground">{a}</span>
              <span>{typeof v === "number" ? v : "—"}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-[#FFCF01]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const pretty = (k: string) => k.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");

/**
 * Renders rows whose shape the ESA guide doesn't document (sessions, machine activity,
 * coaches, NFC cards): columns come from the data, so nothing is hidden or guessed.
 */
export function GenericTable({ rows, maxColumns = 10 }: { rows: any[]; maxColumns?: number }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground">No data.</p>;
  const cols: string[] = [];
  for (const r of rows.slice(0, 30)) {
    for (const [k, v] of Object.entries(r ?? {})) {
      if (!cols.includes(k) && (v === null || typeof v !== "object")) cols.push(k);
    }
  }
  const shown = cols.slice(0, maxColumns);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {shown.map((c) => (
              <TableHead key={c} className="capitalize whitespace-nowrap">
                {pretty(c)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {shown.map((c) => (
                <TableCell key={c} className="max-w-[16rem] truncate whitespace-nowrap text-xs">
                  {r?.[c] === null || r?.[c] === undefined || r?.[c] === "" ? "—" : String(r[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {cols.length > shown.length && (
        <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          Showing {shown.length} of {cols.length} columns.
        </p>
      )}
    </div>
  );
}
