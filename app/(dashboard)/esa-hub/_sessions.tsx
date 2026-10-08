"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorNote, fmtDateTime, Loading, useAsync } from "./_shared";

export function SessionsTab({ rev }: { rev: string }) {
  const [f, setF] = useState({ game: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [raw, setRaw] = useState<any | null>(null);
  const key = `sessions:${f.game}|${f.from}|${f.to}|${page}|${rev}`;
  const { data, error, loading } = useAsync(
    () => api.esa.hub.sessions({ game: f.game || undefined, from: f.from || undefined, to: f.to || undefined, page }),
    key,
    { keepPrevious: true },
  );
  const set = (k: string, v: string) => {
    setF((s) => ({ ...s, [k]: v }));
    setPage(1);
  };
  const cov = data?.coverage;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)));
  const pct = (n: number) => (cov?.total ? `${Math.round((n / cov.total) * 100)}%` : "—");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="se-game">Game code</Label>
          <Input id="se-game" placeholder="e.g. PAS1" value={f.game} onChange={(e) => set("game", e.target.value)} className="w-36" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="se-from">From</Label>
          <Input id="se-from" type="date" value={f.from} onChange={(e) => set("from", e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="se-to">To</Label>
          <Input id="se-to" type="date" value={f.to} onChange={(e) => set("to", e.target.value)} className="w-40" />
        </div>
      </div>

      {cov && cov.total > 0 && (
        <p className="text-xs text-muted-foreground">
          {cov.total.toLocaleString()} sessions stored · recognised fields: date {pct(cov.startedAt)} · game {pct(cov.gameCode)} · machine {pct(cov.machine)} · score {pct(cov.score)}. Use “Raw” on a row to see exactly what ESA returned.
        </p>
      )}

      <ErrorNote message={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Game</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Duration (s)</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="text-right">Raw</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(r.startedAt)}</TableCell>
                      <TableCell className="text-xs">
                        {r.name || r.username}
                        {r.name && <span className="ml-1 font-mono text-muted-foreground">{r.username}</span>}
                      </TableCell>
                      <TableCell>{r.gameCode ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.machine ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.product ?? "—"}</TableCell>
                      <TableCell>{r.durationSec ?? "—"}</TableCell>
                      <TableCell className="font-semibold">{r.score ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setRaw(raw?.id === r.id ? null : r)}>
                          {raw?.id === r.id ? "Hide" : "Raw"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                        {cov?.total ? "No sessions match." : "No sessions stored yet — run Sync now (it backfills over several runs)."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {raw && (
              <Card>
                <CardContent className="p-3">
                  <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(raw.raw, null, 2)}</pre>
                </CardContent>
              </Card>
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages} · {data.total.toLocaleString()} sessions
              </span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}
