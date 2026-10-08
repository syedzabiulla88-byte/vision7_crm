"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttributeBars, ErrorNote, fmtDateTime, GenericTable, Loading, Stat, timeAgo, useAsync } from "./_shared";

export function PlayersTab({ rev, canLink }: { rev: string; canLink: boolean }) {
  const [ver, setVer] = useState(0);
  const { data, error, loading } = useAsync(() => api.esa.hub.players(), `players:${rev}:${ver}`, { keepPrevious: true });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unlinked" | "linked">("all");
  const [open, setOpen] = useState<any | null>(null);
  const [linking, setLinking] = useState<any | null>(null);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ((data?.players ?? []) as any[]).filter((p) => {
      if (filter === "unlinked" && p.link) return false;
      if (filter === "linked" && !p.link) return false;
      return !t || [p.username, p.name, p.email, p.link?.name].some((x) => String(x ?? "").toLowerCase().includes(t));
    });
  }, [data, q, filter]);

  const unlink = async (p: any) => {
    try {
      await api.esa.hub.unlink(p.esaUserId);
      toast.success("Unlinked");
      setVer((v) => v + 1);
    } catch (e: any) {
      toast.error(e?.message || "Could not unlink");
    }
  };

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
              <Stat label="Not linked" value={data.total - data.linked} hint="Match by email is automatic; link the rest here" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input placeholder="Search name, email or ESA username…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
              {(["all", "unlinked", "linked"] as const).map((f) => (
                <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
                  {f}
                </Button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ESA username</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>ESA Index</TableHead>
                    <TableHead>Last session</TableHead>
                    <TableHead>CRM member</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.esaUserId}>
                      <TableCell className="font-mono text-xs">
                        {p.username}
                        {!p.active && <Badge variant="outline" className="ml-2">inactive</Badge>}
                      </TableCell>
                      <TableCell>{p.name || "—"}</TableCell>
                      <TableCell>{p.sessionCount}</TableCell>
                      <TableCell className="font-semibold">
                        {p.indexAverage ?? "—"}
                        {p.indexLevel && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{p.indexLevel}</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.lastSessionAt ? timeAgo(p.lastSessionAt) : "—"}</TableCell>
                      <TableCell>
                        {p.link ? (
                          <span className="inline-flex items-center gap-1.5">
                            {p.link.kind === "contact" ? (
                              <Link href={`/crm/${p.link.id}`} className="text-sky-600 hover:underline dark:text-sky-400">
                                {p.link.name || "Open"}
                              </Link>
                            ) : (
                              <span>{p.link.name}</span>
                            )}
                            {p.link.source && <span className="text-[10px] uppercase text-muted-foreground">{p.link.source}</span>}
                          </span>
                        ) : (
                          <Badge variant="outline">Not linked</Badge>
                        )}
                      </TableCell>
                      <TableCell className="space-x-1.5 text-right">
                        <Button size="sm" variant="outline" onClick={() => setOpen(p)}>
                          View
                        </Button>
                        {canLink &&
                          (p.link ? (
                            <Button size="sm" variant="ghost" onClick={() => unlink(p)}>
                              Unlink
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setLinking(p)}>
                              Link
                            </Button>
                          ))}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                        {data.total === 0 ? "No players stored yet — run Sync now." : "No players match."}
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
      {linking && (
        <LinkDialog
          player={linking}
          onClose={() => setLinking(null)}
          onLinked={() => {
            setLinking(null);
            setVer((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

function LinkDialog({ player, onClose, onLinked }: { player: any; onClose: () => void; onLinked: () => void }) {
  const [q, setQ] = useState(player.name || "");
  const [term, setTerm] = useState(player.name || "");
  const { data, loading } = useAsync(() => api.esa.hub.linkCandidates(term), `cand:${term}`);
  const [busy, setBusy] = useState(false);

  const link = async (c: any) => {
    setBusy(true);
    try {
      await api.esa.hub.link(player.esaUserId, c.kind, c.id);
      toast.success(`Linked ${player.username} to ${c.name}`);
      onLinked();
    } catch (e: any) {
      toast.error(e?.message || "Could not link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link {player.username}</DialogTitle>
          <DialogDescription>
            Choose the CRM member this ESA player is. This is stored in the CRM only — nothing is changed in ESA.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(q.trim());
          }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone…" autoFocus />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {loading && <p className="text-sm text-muted-foreground">Searching…</p>}
          {!loading && (data ?? []).length === 0 && <p className="text-sm text-muted-foreground">{term.length < 2 ? "Type at least 2 characters." : "No members found."}</p>}
          {(data ?? []).map((c: any) => (
            <div key={`${c.kind}-${c.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.kind === "athlete" ? "Athlete" : "Contact"}
                  {c.detail ? ` · ${c.detail}` : ""}
                </p>
              </div>
              <Button size="sm" disabled={busy} onClick={() => link(c)}>
                Link
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlayerDialog({ player, onClose }: { player: any; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAsync(() => api.esa.hub.player(player.esaUserId, { page }), `player:${player.esaUserId}:${page}`, { keepPrevious: true });
  const idx = data?.index;
  const hist: any[] = data?.indexHistory ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.sessions?.total ?? 0) / (data?.sessions?.pageSize ?? 25)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{player.name || player.username}</DialogTitle>
          <DialogDescription>
            {player.username}
            {player.link?.name ? ` · CRM: ${player.link.name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <ErrorNote message={error} />
          {loading && !data ? (
            <Loading />
          ) : (
            <>
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">ESA Index</span>
                  {idx ? (
                    <span>
                      <span className="text-2xl font-semibold">{idx.average}</span>
                      {idx.level && <span className="ml-2 text-xs text-muted-foreground">{idx.level}</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No ESA Index data stored yet.</span>
                  )}
                </div>
                {idx && (
                  <>
                    <AttributeBars values={idx.attributes} />
                    <p className="text-xs text-muted-foreground">
                      Model {idx.modelVersion ?? "—"} · pulled {timeAgo(idx.syncedAt)}
                    </p>
                  </>
                )}
                {hist.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    History: {hist.map((h) => `${h.average} (${new Date(h.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })})`).join("  →  ")}
                  </p>
                )}
              </div>

              {(data?.byGame ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.byGame.map((g: any) => (
                    <Badge key={g.game_code} variant="outline">
                      {g.game_code}: {g.sessions}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Sessions ({data?.sessions?.total ?? 0}) <span className="text-xs font-normal text-muted-foreground">· last session {fmtDateTime(player.lastSessionAt)}</span>
                </p>
                <GenericTable
                  rows={(data?.sessions?.rows ?? []).map((r: any) => ({ started: r.startedAt, game: r.gameCode, machine: r.machine, product: r.product, duration_s: r.durationSec, score: r.score }))}
                />
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                )}
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
