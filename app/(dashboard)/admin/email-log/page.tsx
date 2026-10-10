"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGate } from "@/components/shared/permission-gate";
import { useAsync } from "@/components/hooks/use-async";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUSES = ["ALL", "SENT", "FAILED", "SKIPPED"] as const;

const STATUS_CLASS: Record<string, string> = {
  SENT: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  FAILED: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  SKIPPED: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

function when(v: string) {
  return new Date(v).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function EmailLogPage() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("ALL");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [ver, setVer] = useState(0);
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useAsync(
    () => api.emailLog.list({ status: status === "ALL" ? undefined : status, q: q || undefined, page, limit: 50 }),
    `log:${status}|${q}|${page}|${ver}`,
    { keepPrevious: true },
  );
  const summary = useAsync(() => api.emailLog.summary(), `sum:${ver}`, { keepPrevious: true });

  const runPreview = async () => {
    setBusy(true);
    try {
      setPreview(await api.emailLog.previewReminders());
    } catch (e: any) {
      toast.error(e?.message || "Could not build the preview");
    } finally {
      setBusy(false);
    }
  };

  const rows: any[] = list.data?.data ?? [];
  const meta = list.data?.meta;
  const s = summary.data;

  return (
    <PermissionGate permission="settings:manage" fallback={<p className="text-sm text-muted-foreground">You don&apos;t have access to this page.</p>}>
      <div className="space-y-6">
        <PageHeader
          title="Email Log"
          description="Every email the system tried to send. “Sent” means the email service accepted it — it cannot confirm the customer's inbox received it."
          onRefresh={() => setVer((v) => v + 1)}
          actions={
            <Button variant="outline" onClick={runPreview} disabled={busy}>
              {busy ? "Checking…" : "Preview reminders"}
            </Button>
          }
        />

        <div className="grid grid-cols-3 gap-3">
          {(["SENT", "FAILED", "SKIPPED"] as const).map((k) => (
            <Card key={k}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{k.charAt(0) + k.slice(1).toLowerCase()} · last 7 days</p>
                <p className="text-2xl font-semibold">{s ? s[k] : "—"}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {preview && (
          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  Reminders that would go out now: {preview.preview?.length ?? 0}
                </p>
                <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                  Close
                </Button>
              </div>
              {(preview.preview ?? []).length === 0 ? (
                <p className="text-muted-foreground">Nobody is due a renewal or instalment reminder right now.</p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto text-xs">
                  {preview.preview.map((p: any, i: number) => (
                    <div key={i} className="flex flex-wrap gap-x-3 border-b border-border py-1">
                      <Badge variant="outline">{p.kind}</Badge>
                      <span className="font-mono">{p.to}</span>
                      <span className="text-muted-foreground">{p.detail}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Nothing was sent. Reminders only go out once switched on in Settings → Notifications.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((st) => (
            <Button
              key={st}
              size="sm"
              variant={status === st ? "default" : "outline"}
              onClick={() => {
                setStatus(st);
                setPage(1);
              }}
            >
              {st === "ALL" ? "All" : st.charAt(0) + st.slice(1).toLowerCase()}
            </Button>
          ))}
          <Input
            placeholder="Search address or subject…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
        </div>

        {list.loading && !list.data ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">{when(r.createdAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.to}</TableCell>
                    <TableCell className="max-w-[22rem] truncate text-xs">{r.subject}</TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{r.kind ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_CLASS[r.status]}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[20rem] truncate text-xs text-muted-foreground" title={r.error || r.messageId || ""}>
                      {r.error || r.messageId || "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No emails logged yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {meta.page} of {meta.totalPages} · {meta.total} emails
            </span>
            <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </PermissionGate>
  );
}
