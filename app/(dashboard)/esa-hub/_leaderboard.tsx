"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorNote, Loading, timeAgo, useAsync } from "./_shared";

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Stored snapshot by default; a custom filter query goes to ESA live (read-only) and is shown instead. */
export function LeaderboardTab({ rev }: { rev: string }) {
  const stored = useAsync(() => api.esa.hub.leaderboard(), `lb-stored:${rev}`, { keepPrevious: true });
  const [venues, setVenues] = useState<any[]>([]);
  const [f, setF] = useState({ from: "", to: "", venue_id: "", opponent_venue_id: "", game_code: "", machine: "", username: "", limit: "10" });
  const [live, setLive] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.esa.venues().then((r) => setVenues(r?.venues ?? [])).catch(() => undefined);
  }, []);

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(f)) if (v) params[k] = v;
      setLive(await api.esa.leaderboard(params));
    } catch (e: any) {
      setError(e?.message || "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  };

  const data = live ?? stored.data?.data;
  const source = live ? "live from ESA (custom filters)" : stored.data ? `stored snapshot · pulled ${timeAgo(stored.data.fetchedAt)}` : null;
  const compare = !!data?.scope?.is_comparison;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="lb-from">From</Label>
            <Input id="lb-from" type="date" value={f.from} onChange={(e) => set("from", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lb-to">To</Label>
            <Input id="lb-to" type="date" value={f.to} onChange={(e) => set("to", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lb-venue">Venue</Label>
            <select id="lb-venue" className={selectCls} value={f.venue_id} onChange={(e) => set("venue_id", e.target.value)}>
              <option value="">Our venue</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lb-opp">Compare with</Label>
            <select id="lb-opp" className={selectCls} value={f.opponent_venue_id} onChange={(e) => set("opponent_venue_id", e.target.value)}>
              <option value="">— none —</option>
              {venues
                .filter((v) => String(v.id) !== f.venue_id)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lb-game">Game code</Label>
            <Input id="lb-game" placeholder="e.g. PAS1" value={f.game_code} onChange={(e) => set("game_code", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lb-machine">Machine</Label>
            <Input id="lb-machine" placeholder="e.g. Icon 1" value={f.machine} onChange={(e) => set("machine", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lb-user">Find player</Label>
            <Input id="lb-user" placeholder="ESA username" value={f.username} onChange={(e) => set("username", e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" onClick={run} disabled={loading} className="flex-1">
              {loading ? "Loading…" : "Run with these filters"}
            </Button>
            {live && (
              <Button type="button" variant="outline" onClick={() => setLive(null)}>
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <ErrorNote message={error || stored.error} />
      {(loading || (stored.loading && !stored.data)) && <Loading />}

      {data ? (
        <>
          <p className="text-xs text-muted-foreground">
            {data.scope?.period?.from} → {data.scope?.period?.to} · {data.summary?.sessions_count ?? 0} sessions · {source}
          </p>

          {data.user_lookup && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {data.user_lookup.username} {data.user_lookup.found ? "" : "— not found / not opted in"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {(data.user_lookup.positions ?? []).map((p: any, i: number) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span>
                      {p.game?.name} · {p.machine?.name}
                    </span>
                    <span>
                      #{p.rank} of {p.participant_count} · {p.score?.display}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(data.leaderboards ?? []).length === 0 && <p className="text-sm text-muted-foreground">No leaderboard rows.</p>}
          {(data.leaderboards ?? []).map((lb: any, i: number) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>
                    {lb.game?.name} <span className="text-muted-foreground">· {lb.machine?.name}</span>
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {lb.game?.score_by} ({lb.game?.direction} wins)
                    </span>
                    {compare && lb.winner && (
                      <Badge variant={lb.winner.status === "winner" ? "secondary" : "outline"}>
                        {lb.winner.status === "winner"
                          ? `Winner: ${(lb.venue_results ?? []).find((r: any) => r.venue?.id === lb.winner.venue_id)?.venue?.name ?? lb.winner.venue_id}`
                          : lb.winner.status}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Player</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Misses</TableHead>
                        <TableHead>Venue</TableHead>
                        <TableHead>Machine</TableHead>
                        <TableHead>Achieved</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(lb.entries ?? []).map((e: any, j: number) => (
                        <TableRow key={j}>
                          <TableCell className="font-medium">{e.rank}</TableCell>
                          <TableCell>
                            {e.user?.display_name || e.user?.username}
                            <span className="ml-1.5 text-xs text-muted-foreground">{e.user?.username}</span>
                          </TableCell>
                          <TableCell className="font-semibold">
                            {e.score?.display} <span className="text-xs font-normal text-muted-foreground">{e.score?.unit}</span>
                          </TableCell>
                          <TableCell>{e.misses ?? "—"}</TableCell>
                          <TableCell className="text-xs">{e.venue?.name}</TableCell>
                          <TableCell className="text-xs">{e.machine?.name}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{e.achieved_at}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      ) : (
        !stored.loading && !loading && <p className="text-sm text-muted-foreground">No leaderboard stored yet — run Sync now, or use the filters above to query ESA directly.</p>
      )}
    </div>
  );
}
