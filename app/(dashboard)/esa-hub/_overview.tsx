"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote, Loading, Stat, timeAgo, useAsync } from "./_shared";

export function OverviewTab({ rev }: { rev: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, error, loading } = useAsync(
    () => api.esa.hub.overview({ from: from || undefined, to: to || undefined }),
    `overview:${from}|${to}|${rev}`,
    { keepPrevious: true },
  );

  const modes: any[] = data?.modes ?? [];
  const maxSessions = Math.max(1, ...modes.map((m) => Number(m.session_count) || 0));
  const top = data?.topMode;
  const noDates = data && data.sessions.stored > 0 && data.sessions.withoutDate === data.sessions.stored;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ov-from">From</Label>
          <Input id="ov-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ov-to">To</Label>
          <Input id="ov-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          {data?.period ? `Showing ${data.period.from} → ${data.period.to}` : "Defaults to the current month."}
        </p>
      </div>

      <ErrorNote message={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            {noDates && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                Sessions are stored but none has a recognisable date yet, so period figures show zero. Open the <strong>Sessions</strong> tab to see ESA&apos;s field names — the date mapping can be adjusted from there.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="ESA players" value={data.players.total} hint={`${data.players.active} active`} />
              <Stat label="Linked to CRM members" value={data.players.linkedToCrm} hint={`${data.players.withSessions} have sessions stored`} />
              <Stat label="Sessions in period" value={data.sessions.inPeriod} hint={`${data.sessions.uniquePlayersInPeriod} players · ${data.sessions.stored.toLocaleString()} stored in total`} />
              <Stat label="Most played mode" value={top?.game_code ?? "—"} hint={top ? `${top.session_count} sessions · ${top.unique_players} players` : undefined} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Game-mode activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {modes.length === 0 && <p className="text-sm text-muted-foreground">No sessions in this period.</p>}
                {modes.map((m) => (
                  <div key={m.game_code} className="space-y-0.5">
                    <div className="flex justify-between text-sm">
                      <span>{m.game_code}</span>
                      <span className="text-muted-foreground">
                        {m.session_count} sessions · {m.unique_players} players
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-[#FFCF01]" style={{ width: `${((Number(m.session_count) || 0) / maxSessions) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Venues</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {(data.venues ?? []).length === 0 && <p className="text-muted-foreground">No venues stored yet.</p>}
                {(data.venues ?? []).map((v: any) => (
                  <div key={v.id} className="flex justify-between gap-3">
                    <span>
                      {v.name}
                      {v.is_own ? <span className="ml-2 text-xs text-muted-foreground">(ours)</span> : null}
                    </span>
                    <span className="text-muted-foreground">
                      {v.country_code} · {v.machine_count} machines · {(v.products ?? []).join(", ")}
                    </span>
                  </div>
                ))}
                {data.venuesAt && <p className="pt-1 text-xs text-muted-foreground">Pulled {timeAgo(data.venuesAt)}</p>}
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
