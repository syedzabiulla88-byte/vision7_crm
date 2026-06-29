"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGate } from "@/components/shared/permission-gate";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { usePermissions } from "@/components/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DoorOpen,
  Search,
  Wifi,
  WifiOff,
  ScanLine,
  Nfc,
  CreditCard,
  Repeat,
  Unlink,
  Ban,
  History,
  CircleCheck,
  CircleX,
  CircleDot,
  Warning,
  Check,
  RefreshCw,
  IdCard,
} from "@/lib/icons";

// ─── Domain types (loose — backend payloads are `any` in the api client) ────────

type SubjectKind = "ATHLETE" | "CRM_CONTACT" | "USER" | "FAMILY_MEMBER";

interface MemberPick {
  subjectKind: SubjectKind;
  subjectId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  membershipStatus?: string | null;
  cardCount?: number;
}

interface AccessCard {
  id: string;
  cardId: string;
  displayCardId?: string | null;
  cardType?: string | null;
  status: string; // ACTIVE | DISABLED
  issuedAt?: string | null;
}

interface MembershipGate {
  status?: string | null; // ACTIVE | EXPIRED | PENDING …
  valid?: boolean;
  validUntil?: string | null;
  plans?: Array<{ id: string; name: string }>;
  grantedDoorIds?: string[];
}

interface MemberDetail {
  subject: {
    subjectKind: SubjectKind;
    subjectId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  membership?: MembershipGate | null;
  biostarLink?: { biostarUserId: string } | null;
  cards?: AccessCard[];
}

interface AccessEventRow {
  id: string;
  doorName?: string | null;
  doorId?: string | null;
  result?: string | null; // GRANTED | DENIED
  at: string;
  biostarUserId?: string | null;
  subjectName?: string | null;
}

interface Door {
  id: string;
  name: string;
}

// ─── Format helpers ──────────────────────────────────────────────────────────────

function formatDateTime(value: unknown): string {
  if (!value) return "—";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const SUBJECT_KIND_LABEL: Record<string, string> = {
  ATHLETE: "Academy",
  CRM_CONTACT: "Leisure",
  USER: "Staff",
  FAMILY_MEMBER: "Family",
};

function membershipVariant(status: unknown): "default" | "secondary" | "destructive" | "outline" {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "default";
  if (s === "PENDING" || s === "FROZEN") return "secondary";
  if (s === "EXPIRED" || s === "CANCELLED" || s === "SUSPENDED") return "destructive";
  return "outline";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccessControlPage() {
  return (
    <PermissionGate
      permission="accesscontrol:view"
      fallback={
        <div className="space-y-6">
          <PageHeader
            title="Device Access Control"
            description="Card access, readers and door-event history."
          />
          <Card>
            <CardContent>
              <EmptyState
                icon={<Warning className="h-6 w-6 text-muted-foreground" />}
                title="You don't have access"
                description="Device access control requires the accesscontrol:view permission. Ask an administrator to grant it."
              />
            </CardContent>
          </Card>
        </div>
      }
    >
      <AccessControlInner />
    </PermissionGate>
  );
}

function AccessControlInner() {
  const { can } = usePermissions();
  const canManage = can("accesscontrol:manage");

  const [selected, setSelected] = useState<MemberPick | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [doors, setDoors] = useState<Door[]>([]);

  // Load the cached door list once (used to label granted-door ids).
  useEffect(() => {
    api.accessControl
      .doors()
      .then((res) => setDoors(Array.isArray(res) ? res : []))
      .catch(() => setDoors([]));
  }, []);

  const doorName = useCallback(
    (id: string) => doors.find((d) => d.id === id)?.name || id,
    [doors],
  );

  const loadDetail = useCallback(async (pick: MemberPick) => {
    setDetailLoading(true);
    try {
      const res = (await api.accessControl.member(pick.subjectKind, pick.subjectId)) as MemberDetail;
      setDetail(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load member access detail");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const selectMember = useCallback(
    (pick: MemberPick) => {
      setSelected(pick);
      setDetail(null);
      loadDetail(pick);
    },
    [loadDetail],
  );

  const refreshDetail = useCallback(() => {
    if (selected) loadDetail(selected);
  }, [selected, loadDetail]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Device Access Control"
        description="Issue and manage member access cards, scan readers, and audit door entries — backed by BioStar via the on-premise agent."
        actions={<StatusChip />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left — member picker */}
        <div className="lg:col-span-1">
          <MemberPicker
            selectedId={selected ? `${selected.subjectKind}:${selected.subjectId}` : null}
            onSelect={selectMember}
          />
        </div>

        {/* Right — selected member's access */}
        <div className="space-y-6 lg:col-span-2">
          {!selected ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={<IdCard className="h-6 w-6 text-muted-foreground" />}
                  title="Select a member"
                  description="Search and pick a member on the left to view their membership gate, manage access cards, and see door entries."
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <MembershipGatePanel
                detail={detail}
                loading={detailLoading}
                doorName={doorName}
              />
              <CardsPanel
                detail={detail}
                selected={selected}
                loading={detailLoading}
                canManage={canManage}
                onChanged={refreshDetail}
              />
            </>
          )}

          {/* Usage log spans the full member context (filtered by selected member). */}
          <UsageLog
            subjectId={selected?.subjectId ?? null}
            subjectName={selected?.name ?? null}
            doors={doors}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Connection status chip ──────────────────────────────────────────────────────

interface Status {
  agentOnline: boolean;
  lastSyncAt: string | null;
  deviceCount: number;
  onlineDeviceCount: number;
  dryRun: boolean;
  enabled?: boolean;
}

function StatusChip() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = (await api.accessControl.status()) as Status;
      setStatus(res);
    } catch {
      setError(true);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(t);
  }, [load]);

  if (loading && !status) {
    return <Skeleton className="h-9 w-44" />;
  }

  const online = !error && status?.agentOnline;

  return (
    <button
      type="button"
      onClick={load}
      title="Click to refresh agent status"
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
        online
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      <span>{online ? "Agent online" : error ? "Unavailable" : "Agent offline"}</span>
      {status && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {status.onlineDeviceCount}/{status.deviceCount} devices
          </span>
          {status.lastSyncAt && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">synced {formatDateTime(status.lastSyncAt)}</span>
            </>
          )}
          {status.dryRun && (
            <Badge variant="outline" className="ml-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
              Dry-run
            </Badge>
          )}
        </>
      )}
    </button>
  );
}

// ─── Member picker (searchable) ──────────────────────────────────────────────────

function MemberPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (pick: MemberPick) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<MemberPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.accessControl.members(q.trim() ? { q: q.trim() } : undefined);
      const list: MemberPick[] = Array.isArray(res) ? res : res?.data || [];
      setRows(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce the search.
  useEffect(() => {
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Members</CardTitle>
        <CardDescription>Pick a member to manage their access.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, ID…"
            className="pl-9"
            aria-label="Search members"
          />
        </div>

        <div className="max-h-[28rem] space-y-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))
          ) : error ? (
            <div className="space-y-2 py-6 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => load(query)}>
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {query.trim() ? "No members match your search." : "No members found."}
            </p>
          ) : (
            rows.map((m) => {
              const id = `${m.subjectKind}:${m.subjectId}`;
              const active = id === selectedId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelect(m)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
                    active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted",
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{(m.name?.charAt(0) || "?").toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{m.name || "—"}</p>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {SUBJECT_KIND_LABEL[m.subjectKind] || m.subjectKind}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.phone || m.email || "—"}
                    </p>
                  </div>
                  {(m.cardCount ?? 0) > 0 && (
                    <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                      <CreditCard className="h-3 w-3" />
                      {m.cardCount}
                    </Badge>
                  )}
                </button>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Membership gate panel ───────────────────────────────────────────────────────

function MembershipGatePanel({
  detail,
  loading,
  doorName,
}: {
  detail: MemberDetail | null;
  loading: boolean;
  doorName: (id: string) => string;
}) {
  if (loading && !detail) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-48" />
        </CardContent>
      </Card>
    );
  }

  const gate = detail?.membership;
  const valid = gate?.valid ?? String(gate?.status || "").toUpperCase() === "ACTIVE";
  const grantedDoorIds = gate?.grantedDoorIds ?? [];

  return (
    <Card
      className={cn(
        "border-l-4",
        valid ? "border-l-emerald-500" : "border-l-destructive",
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            {valid ? (
              <CircleCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CircleX className="h-5 w-5 text-destructive" />
            )}
            Membership gate
          </span>
          <Badge variant={membershipVariant(gate?.status)}>
            {gate?.status || (valid ? "ACTIVE" : "NONE")}
          </Badge>
        </CardTitle>
        <CardDescription>
          {valid
            ? "This member has a valid membership — access cards will open their granted doors."
            : "No valid membership. Cards may be denied at the reader; issue or renew a membership first."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Valid until</p>
            <p className="font-medium">{formatDate(gate?.validUntil)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan(s)</p>
            <p className="font-medium">
              {gate?.plans && gate.plans.length > 0
                ? gate.plans.map((p) => p.name).join(", ")
                : "—"}
            </p>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            Granted doors ({grantedDoorIds.length})
          </p>
          {grantedDoorIds.length === 0 ? (
            <p className="text-muted-foreground">
              No doors granted by this member&apos;s plan(s).
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {grantedDoorIds.map((id) => (
                <Badge key={id} variant="outline" className="gap-1">
                  <DoorOpen className="h-3 w-3" />
                  {doorName(id)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Cards panel (Issue / Replace / Reassign / Revoke) ───────────────────────────

function CardsPanel({
  detail,
  selected,
  loading,
  canManage,
  onChanged,
}: {
  detail: MemberDetail | null;
  selected: MemberPick;
  loading: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const cards = detail?.cards ?? [];
  const [issueOpen, setIssueOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<AccessCard | null>(null);
  const [reassignTarget, setReassignTarget] = useState<AccessCard | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AccessCard | null>(null);
  const [revoking, setRevoking] = useState(false);

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await api.accessControl.revokeCard(revokeTarget.id);
      toast.success("Card revoked");
      setRevokeTarget(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke card");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Access cards</CardTitle>
            <CardDescription>
              Cards held by {selected.name}. Issue, replace, reassign or revoke.
            </CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setIssueOpen(true)}>
              <CreditCard className="h-4 w-4" />
              Issue card
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && !detail ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No cards issued to this member yet.
            {canManage && " Use “Issue card” to enroll one."}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((c) => {
                  const active = String(c.status).toUpperCase() === "ACTIVE";
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">
                        {c.displayCardId || c.cardId}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.cardType || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={active ? "default" : "outline"}
                          className={cn("gap-1", !active && "text-muted-foreground")}
                        >
                          {active ? (
                            <CircleDot className="h-3 w-3" />
                          ) : (
                            <Ban className="h-3 w-3" />
                          )}
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(c.issuedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canManage && (
                            <>
                              <Button
                                variant="outline"
                                size="icon-sm"
                                onClick={() => setReplaceTarget(c)}
                                title="Replace card"
                                aria-label="Replace card"
                              >
                                <Repeat />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon-sm"
                                onClick={() => setReassignTarget(c)}
                                title="Reassign card"
                                aria-label="Reassign card"
                              >
                                <Unlink />
                              </Button>
                              <Button
                                variant="destructive"
                                size="icon-sm"
                                onClick={() => setRevokeTarget(c)}
                                disabled={!active}
                                title="Revoke card"
                                aria-label="Revoke card"
                              >
                                <Ban />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {issueOpen && (
        <IssueCardDialog
          subject={selected}
          title="Issue card"
          description={`Enroll a new access card for ${selected.name}.`}
          onClose={() => setIssueOpen(false)}
          onDone={() => {
            setIssueOpen(false);
            onChanged();
          }}
        />
      )}

      {replaceTarget && (
        <IssueCardDialog
          subject={selected}
          replaceCardId={replaceTarget.id}
          title="Replace card"
          description={`Replace card ${
            replaceTarget.displayCardId || replaceTarget.cardId
          } for ${selected.name}. The old card is revoked once the new one is enrolled.`}
          onClose={() => setReplaceTarget(null)}
          onDone={() => {
            setReplaceTarget(null);
            onChanged();
          }}
        />
      )}

      {reassignTarget && (
        <ReassignCardDialog
          card={reassignTarget}
          onClose={() => setReassignTarget(null)}
          onDone={() => {
            setReassignTarget(null);
            onChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Revoke card"
        description={`Revoke card ${
          revokeTarget?.displayCardId || revokeTarget?.cardId || ""
        }? It will be disabled in BioStar and can no longer open any door.`}
        confirmLabel="Revoke"
        variant="destructive"
        loading={revoking}
        onConfirm={confirmRevoke}
      />
    </Card>
  );
}

// ─── Issue / Replace card dialog (scan + manual entry) ───────────────────────────

function IssueCardDialog({
  subject,
  replaceCardId,
  title,
  description,
  onClose,
  onDone,
}: {
  subject: MemberPick;
  replaceCardId?: string;
  title: string;
  description: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [manualId, setManualId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scannedCardId, setScannedCardId] = useState<string | null>(null);
  const [scanJobId, setScanJobId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Poll handle so we can stop polling on unmount / dialog close.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startScan = async () => {
    setScannedCardId(null);
    setScanJobId(null);
    setScanning(true);
    try {
      const { jobId } = await api.accessControl.scan();
      setScanJobId(jobId);
      // Poll the job until DONE/FAILED (or the user cancels).
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const job = await api.accessControl.job(jobId);
          const status = String(job.status).toUpperCase();
          if (status === "DONE") {
            stopPolling();
            setScanning(false);
            const cardId =
              job.result?.cardId || job.result?.card_id || job.result?.csn || null;
            if (cardId) {
              setScannedCardId(String(cardId));
              toast.success("Card scanned");
            } else {
              toast.error("Scan completed but no card id was returned");
            }
          } else if (status === "FAILED") {
            stopPolling();
            setScanning(false);
            toast.error(job.error || "Scan failed");
          }
        } catch {
          // transient poll error — keep trying
        }
      }, 1500);
    } catch (err) {
      setScanning(false);
      toast.error(err instanceof Error ? err.message : "Failed to start scan");
    }
  };

  const cancelScan = () => {
    stopPolling();
    setScanning(false);
  };

  const submit = async () => {
    const payload: {
      subjectKind: string;
      subjectId: string;
      cardId?: string;
      fromJobId?: string;
      replaceCardId?: string;
    } = {
      subjectKind: subject.subjectKind,
      subjectId: subject.subjectId,
      ...(replaceCardId ? { replaceCardId } : {}),
    };

    if (mode === "scan") {
      if (scanJobId && scannedCardId) payload.fromJobId = scanJobId;
      else if (scannedCardId) payload.cardId = scannedCardId;
      else {
        toast.error("Scan a card first");
        return;
      }
    } else {
      if (!manualId.trim()) {
        toast.error("Enter a card number");
        return;
      }
      payload.cardId = manualId.trim();
    }

    setSaving(true);
    try {
      await api.accessControl.issueCard(payload);
      toast.success(replaceCardId ? "Card replaced" : "Card issued");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue card");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    stopPolling();
    onClose();
  };

  const cardReady = mode === "scan" ? !!scannedCardId : !!manualId.trim();

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === "scan" ? "default" : "outline"}
            onClick={() => setMode("scan")}
          >
            <ScanLine className="h-4 w-4" />
            Scan reader
          </Button>
          <Button
            type="button"
            variant={mode === "manual" ? "default" : "outline"}
            onClick={() => setMode("manual")}
          >
            <Nfc className="h-4 w-4" />
            Manual entry
          </Button>
        </div>

        {mode === "scan" ? (
          <div className="space-y-3 rounded-md border bg-muted/30 p-4 text-center">
            {scannedCardId ? (
              <div className="space-y-1">
                <CircleCheck className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-medium">Card detected</p>
                <p className="font-mono text-sm">{scannedCardId}</p>
                <Button variant="ghost" size="sm" onClick={startScan} disabled={scanning}>
                  Re-scan
                </Button>
              </div>
            ) : scanning ? (
              <div className="space-y-2">
                <RefreshCw className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Tap a card on any enrollment reader…
                </p>
                <Button variant="ghost" size="sm" onClick={cancelScan}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <ScanLine className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Start a scan, then present the card to a reader.
                </p>
                <Button type="button" size="sm" onClick={startScan}>
                  <ScanLine className="h-4 w-4" />
                  Start scan
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="manual-card">Card number (CSN)</Label>
            <Input
              id="manual-card"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="e.g. 0012345678"
              className="font-mono"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Enter the printed card serial number if you can&apos;t scan it.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!cardReady || saving}>
            <Check className="h-4 w-4" />
            {saving ? "Saving…" : replaceCardId ? "Replace card" : "Issue card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reassign card dialog ────────────────────────────────────────────────────────

function ReassignCardDialog({
  card,
  onClose,
  onDone,
}: {
  card: AccessCard;
  onClose: () => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<MemberPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<MemberPick | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await api.accessControl.members(q.trim() ? { q: q.trim() } : undefined);
      setRows(Array.isArray(res) ? res : res?.data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  const submit = async () => {
    if (!target) {
      toast.error("Pick a member to reassign to");
      return;
    }
    setSaving(true);
    try {
      await api.accessControl.reassignCard(card.id, {
        subjectKind: target.subjectKind,
        subjectId: target.subjectId,
      });
      toast.success(`Card reassigned to ${target.name}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign card");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign card</DialogTitle>
          <DialogDescription>
            Move card{" "}
            <span className="font-mono">{card.displayCardId || card.cardId}</span> to a
            different member. The card keeps its number; only its holder changes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <Warning className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The new holder&apos;s plan doors will apply. If their membership is invalid the
            card may be denied at readers.
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search member to reassign to…"
            className="pl-9"
          />
        </div>

        <div className="max-h-60 space-y-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)
          ) : rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No members found.</p>
          ) : (
            rows.map((m) => {
              const id = `${m.subjectKind}:${m.subjectId}`;
              const active = target && `${target.subjectKind}:${target.subjectId}` === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTarget(m)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
                    active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted",
                  )}
                >
                  <Avatar className="h-7 w-7">
                    <AvatarFallback>{(m.name?.charAt(0) || "?").toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.phone || m.email || "—"}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {SUBJECT_KIND_LABEL[m.subjectKind] || m.subjectKind}
                  </Badge>
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!target || saving}>
            <Unlink className="h-4 w-4" />
            {saving ? "Reassigning…" : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Usage log (searchable door-event history) ───────────────────────────────────

const RESULT_OPTIONS = [
  { value: "ALL", label: "All results" },
  { value: "GRANTED", label: "Granted" },
  { value: "DENIED", label: "Denied" },
];

function UsageLog({
  subjectId,
  subjectName,
  doors,
}: {
  subjectId: string | null;
  subjectName: string | null;
  doors: Door[];
}) {
  const [doorId, setDoorId] = useState("ALL");
  const [result, setResult] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scope, setScope] = useState<"MEMBER" | "ALL">("MEMBER");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AccessEventRow[]>([]);
  const [meta, setMeta] = useState<{ total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Default to the selected member; reset scope/page when the member changes.
  useEffect(() => {
    setScope(subjectId ? "MEMBER" : "ALL");
    setPage(1);
  }, [subjectId]);

  const effectiveSubject = scope === "MEMBER" ? subjectId : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { page, limit: 20 };
      if (effectiveSubject) params.subjectId = effectiveSubject;
      if (doorId !== "ALL") params.doorId = doorId;
      if (result !== "ALL") params.result = result;
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.accessControl.events(params);
      const list: AccessEventRow[] = Array.isArray(res) ? res : res?.data || [];
      setRows(list);
      setMeta(Array.isArray(res) ? null : res?.meta ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, effectiveSubject, doorId, result, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const doorOptions = useMemo(
    () => [{ value: "ALL", label: "All doors" }, ...doors.map((d) => ({ value: d.id, label: d.name }))],
    [doors],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" />
              Usage log
            </CardTitle>
            <CardDescription>
              {scope === "MEMBER" && subjectName
                ? `Door entries for ${subjectName}.`
                : "Door entries across all members."}
            </CardDescription>
          </div>
          {subjectId && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={scope === "MEMBER" ? "default" : "outline"}
                onClick={() => {
                  setScope("MEMBER");
                  setPage(1);
                }}
              >
                This member
              </Button>
              <Button
                size="sm"
                variant={scope === "ALL" ? "default" : "outline"}
                onClick={() => {
                  setScope("ALL");
                  setPage(1);
                }}
              >
                All
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Door</Label>
            <Select value={doorId} onValueChange={(v) => { setDoorId(String(v)); setPage(1); }}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {doorOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Result</Label>
            <Select value={result} onValueChange={(v) => { setResult(String(v)); setPage(1); }}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                {scope === "ALL" && <TableHead>Member</TableHead>}
                <TableHead>Door</TableHead>
                <TableHead className="text-right">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={scope === "ALL" ? 4 : 3} className="h-24 text-center text-muted-foreground">
                    Loading events…
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={scope === "ALL" ? 4 : 3} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-destructive">{error}</p>
                      <Button variant="outline" size="sm" onClick={load}>
                        Retry
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={scope === "ALL" ? 4 : 3} className="h-24 text-center text-muted-foreground">
                    No door entries match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((ev) => {
                  const granted = String(ev.result || "").toUpperCase() === "GRANTED";
                  return (
                    <TableRow key={ev.id}>
                      <TableCell className="text-xs">{formatDateTime(ev.at)}</TableCell>
                      {scope === "ALL" && (
                        <TableCell className="text-sm">
                          {ev.subjectName || ev.biostarUserId || "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-sm">{ev.doorName || ev.doorId || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={granted ? "default" : "destructive"}
                          className="gap-1"
                        >
                          {granted ? (
                            <CircleCheck className="h-3 w-3" />
                          ) : (
                            <CircleX className="h-3 w-3" />
                          )}
                          {ev.result || "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pager — simple prev/next driven by meta.totalPages when present. */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {page} of {meta.totalPages} · {meta.total} events
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
