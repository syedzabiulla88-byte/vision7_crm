"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttributeBars, ErrorNote, GenericTable, Loading, Stat, useAsync } from "./_shared";

export function PlayersTab() {
  const { data, error, loading } = useAsync(() => api.esa.hub.players(), "players");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<any | null>(null);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all: any[] = data?.players ?? [];
    return t
      ? all.filter((p) => [p.username, p.name, p.link?.name].some((x) => String(x ?? "").toLowerCase().includes(t)))
      : all;
  }, [data, q]);

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat label="ESA players" value={data.total} />
              <Stat label="Linked to a CRM member" value={data.linked} />
              <Stat label="Not linked" value={data.total - data.linked} hint="Created on ESA outside the CRM" />
            </div>
            <Input placeholder="Search by name or ESA username…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ESA username</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Credits</TableHead>
                    <TableHead>CRM member</TableHead>
                    <TableHead>Wristband</TableHead>
                    <TableHead className="text-right">Performance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={`${p.userID}-${p.username}`}>
                      <TableCell className="font-mono text-xs">{p.username}</TableCell>
                      <TableCell>{p.name || "—"}</TableCell>
                      <TableCell>{p.credit ?? "—"}</TableCell>
                      <TableCell>
                        {p.link ? (
                          p.link.kind === "contact" ? (
                            <Link href={`/crm/${p.link.id}`} className="text-sky-600 hover:underline dark:text-sky-400">
                              {p.link.name || "Open"}
                            </Link>
                          ) : (
                            <span>{p.link.name}</span>
                          )
                        ) : (
                          <Badge variant="outline">Not linked</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.link?.nfcId || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setOpen(p)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No players match.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )
      )}
      {open && <PlayerDialog player={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PlayerDialog({ player, onClose }: { player: any; onClose: () => void }) {
  const { data, error, loading } = useAsync(
    () => api.esa.hub.player(player.username, { userId: player.userID ?? undefined }),
    `player:${player.username}`,
  );
  const idx = data?.index;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{player.name || player.username}</DialogTitle>
          <DialogDescription>
            {player.username}
            {player.link?.name ? ` · CRM: ${player.link.name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <ErrorNote message={error} />
          {loading ? (
            <Loading />
          ) : (
            <>
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">ESA Index</span>
                  {idx?.has_data ? (
                    <span>
                      <span className="text-2xl font-semibold">{idx.average}</span>
                      {idx.level && <span className="ml-2 text-xs text-muted-foreground">{idx.level}</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{idx?.error ? idx.error : "No ESA Index data available yet."}</span>
                  )}
                </div>
                {idx?.has_data && (
                  <>
                    <AttributeBars values={idx.index} />
                    <p className="text-xs text-muted-foreground">
                      {idx.matched_sessions} of {idx.sessions_scanned} sessions counted · model {idx.model_version}
                      {idx.stale ? " · last known value" : ""}
                    </p>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Recent sessions</p>
                <GenericTable rows={data?.sessions?.rows ?? []} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
