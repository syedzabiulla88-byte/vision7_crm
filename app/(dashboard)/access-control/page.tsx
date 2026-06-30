"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  getRelayUrl,
  relayHealth,
  listAccessGroups,
  listDevices,
  scanCard,
  assignCardAndAccess,
  getBiostarUser,
  revokeUserCard,
  type RelayHealth,
  type BiostarAccessGroup,
  type BiostarDevice,
  type BiostarUserState,
  type StepResult,
} from "@/lib/biostar-relay";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  CreditCard,
  Ban,
  CircleCheck,
  CircleX,
  Warning,
  Check,
  IdCard,
  DoorOpen,
  Wifi,
  WifiOff,
  RefreshCw,
  ScanLine,
} from "@/lib/icons";

// ─── Domain types (loose — backend payloads are `any` in the api client) ────────

type SubjectKind = "ATHLETE" | "CRM_CONTACT" | "USER" | "FAMILY_MEMBER";
type PersonKind = "STAFF" | "MEMBER";
type PersonBadge = "Academy" | "Leisure" | "Family" | "Staff";
type MembershipStatusValue =
  | "ACTIVE"
  | "PENDING"
  | "EXPIRED"
  | "FROZEN"
  | "SUSPENDED"
  | "CANCELLED"
  | "NONE";

interface MembershipLite {
  id: string;
  status: string;
  valid: boolean;
  planId?: string | null;
  planName?: string | null;
}

// Enriched unified person row from GET /access-control/members.
interface MemberPick {
  subjectKind: SubjectKind;
  subjectId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  idNumber?: string | null;
  kind?: PersonKind;
  badge?: PersonBadge | string | null;
  role?: string | null;
  memberships?: MembershipLite[];
  plans?: string[];
  membershipStatus?: MembershipStatusValue | string | null;
  hasCard?: boolean;
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
  cards?: AccessCard[];
}

// ─── Format helpers ──────────────────────────────────────────────────────────────

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

/** Prefer the backend's `badge` field; fall back to the subjectKind label. */
function personBadge(m: MemberPick): string {
  return m.badge || SUBJECT_KIND_LABEL[m.subjectKind] || m.subjectKind;
}

function membershipVariant(status: unknown): "default" | "secondary" | "destructive" | "outline" {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "default";
  if (s === "PENDING" || s === "FROZEN") return "secondary";
  if (s === "EXPIRED" || s === "CANCELLED" || s === "SUSPENDED") return "destructive";
  return "outline";
}

/**
 * Tailwind classes for a membership-status pill, colored per the access-list
 * contract: ACTIVE=emerald, PENDING=amber, FROZEN/SUSPENDED=blue/amber,
 * EXPIRED/CANCELLED=muted/destructive, NONE=muted.
 */
function statusPillClass(status: unknown): string {
  switch (String(status || "").toUpperCase()) {
    case "ACTIVE":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "PENDING":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "FROZEN":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "SUSPENDED":
      return "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    case "CANCELLED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "EXPIRED":
    case "NONE":
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

// ─── Shared BioStar relay state ──────────────────────────────────────────────────
//
// The relay URL + health are needed by BOTH the "Access cards" panel (now BioStar-backed)
// and the "BioStar door access" panel. This hook reads the configured relay URL once and
// probes its health, exposing `online` (health.ok) + a `recheck()` so a single fetch feeds
// both panels instead of each fetching its own.

interface BiostarRelay {
  /** null = still loading; "" = not configured. */
  relayUrl: string | null;
  health: RelayHealth | null;
  checking: boolean;
  online: boolean;
  recheck: () => void;
}

function useBiostarRelay(): BiostarRelay {
  const [relayUrl, setRelayUrl] = useState<string | null>(null); // null = loading
  const [health, setHealth] = useState<RelayHealth | null>(null);
  const [checking, setChecking] = useState(false);

  const checkHealth = useCallback(async (url: string) => {
    setChecking(true);
    try {
      setHealth(await relayHealth(url));
    } catch {
      setHealth({ ok: false, reachable: false, error: "Relay unreachable" });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const url = await getRelayUrl();
      if (!active) return;
      setRelayUrl(url);
      if (url) checkHealth(url);
    })();
    return () => {
      active = false;
    };
  }, [checkHealth]);

  const recheck = useCallback(() => {
    if (relayUrl) checkHealth(relayUrl);
  }, [relayUrl, checkHealth]);

  return { relayUrl, health, checking, online: Boolean(health?.ok), recheck };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccessControlPage() {
  return (
    <PermissionGate
      permission="accesscontrol:view"
      fallback={
        <div className="space-y-6">
          <PageHeader
            title="Card Access"
            description="Assign and manage member & staff access cards."
          />
          <Card>
            <CardContent>
              <EmptyState
                icon={<Warning className="h-6 w-6 text-muted-foreground" />}
                title="You don't have access"
                description="Card access requires the accesscontrol:view permission. Ask an administrator to grant it."
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
  const relay = useBiostarRelay();

  const [selected, setSelected] = useState<MemberPick | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
        title="Card Access"
        description="Assign and manage member & staff access cards."
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
                  description="Search and pick a member on the left to view their membership status and manage their access cards."
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <MembershipGatePanel detail={detail} loading={detailLoading} />
              <CardsPanel
                detail={detail}
                selected={selected}
                canManage={canManage}
                relay={relay}
              />
              {canManage && <BiostarPanel selected={selected} detail={detail} relay={relay} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Member picker (searchable) ──────────────────────────────────────────────────

type KindFilter = "ALL" | "MEMBER" | "STAFF";

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "MEMBER", label: "Members" },
  { value: "STAFF", label: "Staff" },
];

function MemberPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (pick: MemberPick) => void;
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL");
  const [hasCardOnly, setHasCardOnly] = useState(false);
  const [rows, setRows] = useState<MemberPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: string, kind: KindFilter, hasCard: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, unknown> = {};
        if (q.trim()) params.q = q.trim();
        if (kind !== "ALL") params.kind = kind;
        if (hasCard) params.hasCard = "true";
        const res = await api.accessControl.members(
          Object.keys(params).length ? params : undefined,
        );
        const list: MemberPick[] = Array.isArray(res) ? res : res?.data || [];
        setRows(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load list");
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Debounce the search; refetch whenever the filters change.
  useEffect(() => {
    const t = setTimeout(() => load(query, kindFilter, hasCardOnly), 300);
    return () => clearTimeout(t);
  }, [query, kindFilter, hasCardOnly, load]);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">People</CardTitle>
        <CardDescription>
          Staff and members — pick one to manage their access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Segmented All / Members / Staff filter */}
        <div className="flex items-center gap-1 rounded-md bg-muted p-1">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setKindFilter(f.value)}
              className={cn(
                "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                kindFilter === f.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, ID…"
            className="pl-9"
            aria-label="Search people"
          />
        </div>

        {/* Has-card toggle */}
        <button
          type="button"
          onClick={() => setHasCardOnly((v) => !v)}
          aria-pressed={hasCardOnly}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
            hasCardOnly
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          <IdCard className="h-3.5 w-3.5" />
          Has card only
        </button>

        <div className="max-h-[28rem] space-y-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))
          ) : error ? (
            <div className="space-y-2 py-6 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => load(query, kindFilter, hasCardOnly)}
              >
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {query.trim() || kindFilter !== "ALL" || hasCardOnly
                ? "No one matches these filters."
                : "No people found."}
            </p>
          ) : (
            rows.map((m) => (
              <PersonRow
                key={`${m.subjectKind}:${m.subjectId}`}
                m={m}
                active={`${m.subjectKind}:${m.subjectId}` === selectedId}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** One row in the unified staff + members picker. */
function PersonRow({
  m,
  active,
  onSelect,
}: {
  m: MemberPick;
  active: boolean;
  onSelect: (pick: MemberPick) => void;
}) {
  const isStaff = m.kind === "STAFF" || m.subjectKind === "USER";
  const status = String(m.membershipStatus || (isStaff ? "" : "NONE")).toUpperCase();

  // Plan line: staff → "Staff access"; members → plan name(s) or muted "No plan".
  const planNames = m.plans && m.plans.length > 0 ? m.plans.join(", ") : "";
  let planLine: ReactNode;
  if (isStaff) {
    planLine = <span className="text-muted-foreground">Staff access{m.role ? ` · ${m.role}` : ""}</span>;
  } else if (planNames) {
    planLine = <span className="truncate text-foreground/80">{planNames}</span>;
  } else {
    planLine = <span className="text-muted-foreground/70">No plan</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(m)}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
        active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted",
      )}
    >
      <Avatar className="mt-0.5 h-8 w-8">
        <AvatarFallback>{(m.name?.charAt(0) || "?").toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        {/* Name + type badge */}
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{m.name || "—"}</p>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {personBadge(m)}
          </Badge>
        </div>
        {/* Plan(s) / staff-access line */}
        <p className="truncate text-xs">{planLine}</p>
        {/* Status pill + card indicator */}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn("text-[10px]", statusPillClass(status))}
          >
            {isStaff && status === "NONE" ? "Staff" : status || "NONE"}
          </Badge>
          {m.hasCard ? (
            <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
              <IdCard className="h-3 w-3" />
              Card{(m.cardCount ?? 0) > 1 ? ` ×${m.cardCount}` : ""}
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// ─── Membership gate panel ───────────────────────────────────────────────────────

function MembershipGatePanel({
  detail,
  loading,
}: {
  detail: MemberDetail | null;
  loading: boolean;
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
            Membership status
          </span>
          <Badge variant={membershipVariant(gate?.status)}>
            {gate?.status || (valid ? "ACTIVE" : "NONE")}
          </Badge>
        </CardTitle>
        <CardDescription>
          {valid
            ? "This member has a valid membership."
            : "No valid membership — issue or renew a membership before relying on their card."}
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
      </CardContent>
    </Card>
  );
}

// ─── Access cards panel (BioStar-backed — single source of truth) ─────────────────
//
// BioStar is the SOURCE OF TRUTH for a member's cards. This panel reads the member's
// real BioStar cards through the relay and lets staff Assign / Revoke directly on
// BioStar. It no longer touches the local-DB card registry.

function CardsPanel({
  detail,
  selected,
  canManage,
  relay,
}: {
  detail: MemberDetail | null;
  selected: MemberPick;
  canManage: boolean;
  relay: BiostarRelay;
}) {
  const { relayUrl, online } = relay;
  const userId = stableUserId(selected);

  const [cards, setCards] = useState<BiostarUserState["cards"]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<BiostarUserState["cards"][number] | null>(null);
  const [revoking, setRevoking] = useState(false);

  const canTalkToBiostar = Boolean(relayUrl) && online;

  const load = useCallback(async () => {
    if (!relayUrl || !online) return;
    setLoading(true);
    setError(null);
    try {
      const u = await getBiostarUser(relayUrl, userId);
      setCards(u.cards);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read BioStar cards");
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [relayUrl, online, userId]);

  // (Re)load whenever the member changes or the relay comes online.
  useEffect(() => {
    if (canTalkToBiostar) load();
    else setCards([]);
  }, [canTalkToBiostar, load]);

  const confirmRevoke = async () => {
    if (!revokeTarget || !relayUrl) return;
    setRevoking(true);
    try {
      await revokeUserCard(relayUrl, userId, revokeTarget.id);
      toast.success(`Card ${revokeTarget.number} revoked`);
      setRevokeTarget(null);
      await load();
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
              {selected.name}&apos;s cards in BioStar. Assign or revoke — BioStar is the source of truth.
            </CardDescription>
          </div>
          {canManage && canTalkToBiostar && (
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              <CreditCard className="h-4 w-4" />
              Assign card
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {relayUrl === null ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !canTalkToBiostar ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            BioStar relay isn&apos;t {relayUrl ? "online" : "configured"} — set it in{" "}
            <span className="font-medium">Settings → BioStar</span>.
          </div>
        ) : loading && cards.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <div className="space-y-2 rounded-md border border-dashed py-6 text-center text-sm">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No cards in BioStar yet.
            {canManage && " Use “Assign card” to add one."}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((c) => (
                  <TableRow key={c.id || c.number}>
                    <TableCell className="font-mono text-xs">{c.number}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canManage && (
                          <Button
                            variant="destructive"
                            size="icon-sm"
                            onClick={() => setRevokeTarget(c)}
                            title="Revoke card"
                            aria-label="Revoke card"
                          >
                            <Ban />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {assignOpen && relayUrl && (
        <CardsAssignDialog
          relayUrl={relayUrl}
          selected={selected}
          detail={detail}
          onClose={() => setAssignOpen(false)}
          onDone={() => {
            setAssignOpen(false);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Revoke card"
        description={`Revoke card ${revokeTarget?.number || ""} from ${selected.name} in BioStar?`}
        confirmLabel="Revoke"
        variant="destructive"
        loading={revoking}
        onConfirm={confirmRevoke}
      />
    </Card>
  );
}

// ─── Assign card dialog (BioStar-backed) ──────────────────────────────────────────
//
// Enrolls + assigns a card to the member IN BIOSTAR via the relay. Card-number entry
// plus a Scan option (read off a reader). Door groups are untouched (applyGroups: false).

function CardsAssignDialog({
  relayUrl,
  selected,
  detail,
  onClose,
  onDone,
}: {
  relayUrl: string;
  selected: MemberPick;
  detail: MemberDetail | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const userId = stableUserId(selected);
  const validUntil = detail?.membership?.validUntil ?? undefined;

  const [cardNumber, setCardNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [steps, setSteps] = useState<StepResult[] | null>(null);

  const [devices, setDevices] = useState<BiostarDevice[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function openScan() {
    setScanOpen(true);
    try {
      setDevices(await listDevices(relayUrl));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load readers");
    }
  }

  async function doScan(deviceId: string) {
    setScanning(true);
    try {
      const res = await scanCard(relayUrl, deviceId);
      if (res.cardId) {
        setCardNumber(res.cardId);
        toast.success(`Read card ${res.cardId}`);
        setScanOpen(false);
      } else {
        console.warn("scan_card returned no card id; raw response:", res.raw);
        toast.error("Reader returned no card. Tap again, or type the number below.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scan failed";
      toast.error(
        /not respond|timeout/i.test(msg)
          ? "Reader timed out — click Scan and tap the card within a few seconds."
          : msg,
      );
    } finally {
      setScanning(false);
    }
  }

  async function submit() {
    const card = cardNumber.trim();
    if (!card) {
      toast.error("Enter or scan a card number");
      return;
    }
    setSaving(true);
    setSteps(null);
    try {
      const result = await assignCardAndAccess({
        relayUrl,
        name: selected.name,
        userId,
        cardNumber: card,
        accessGroupIds: [],
        applyGroups: false, // door groups are managed in the BioStar door-access panel
        expiry: validUntil,
      });
      setSteps(result);
      if (result.every((s) => s.ok)) {
        toast.success("Card assigned in BioStar");
        onDone();
      } else {
        toast.error("Some steps failed — see details below.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign card");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign card</DialogTitle>
          <DialogDescription>
            Enroll &amp; assign a card to{" "}
            <span className="font-medium text-foreground">{selected.name}</span> in BioStar. Door
            groups are managed separately under door access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cards-card">Card number (CSN)</Label>
            <div className="flex gap-2">
              <Input
                id="cards-card"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="e.g. 0012345678"
                className="font-mono"
                autoFocus
              />
              <Button type="button" variant="outline" onClick={openScan}>
                <ScanLine className="h-4 w-4" />
                Scan
              </Button>
            </div>

            {scanOpen && (
              <div className="rounded-md border bg-muted/30 p-2">
                <p className="mb-2 text-xs text-muted-foreground">
                  Pick a reader, then tap the card on it.
                </p>
                {devices.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    No readers found (or still loading).
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {devices.map((d) => {
                      const online = String(d.status) === "1";
                      return (
                        <button
                          key={d.id}
                          type="button"
                          disabled={scanning}
                          onClick={() => doScan(d.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                            scanning && "opacity-60",
                          )}
                        >
                          <span className="truncate">{d.name || d.id}</span>
                          <Badge variant="outline" className={cn("text-[10px]", online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                            {scanning ? "Scanning…" : online ? "Online" : "Offline"}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Per-step result */}
          {steps && (
            <div className="space-y-1.5 rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">Result</p>
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {s.ok ? (
                    <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span>
                    <span className="font-medium">{s.label}:</span>{" "}
                    <span className={cn(!s.ok && "text-destructive")}>{s.message}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!cardNumber.trim() || saving}>
            <Check className="h-4 w-4" />
            {saving ? "Assigning…" : "Assign card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── BioStar door access (Push to BioStar) ───────────────────────────────────────
//
// SEPARATE from the local card registry above. This panel talks to BioStar DIRECTLY
// from the browser, through the on-premises relay (configured in Settings → BioStar).
// It enrolls a card + grants door access groups in BioStar itself. Gated on
// accesscontrol:manage (the caller already checks; the panel guards again on render).

/**
 * A stable numeric BioStar user_id for a member, kept inside BioStar's valid range
 * [1, 2_000_000_000]. BioStar requires a NUMERIC user_id and rejects values above
 * ~2^31 — and any non-digit id — with "Invalid Parameters", so phone digits (12) and
 * many ID numbers overflow and can't be used. We derive it from a stable djb2 hash of
 * subjectKind:subjectId instead; staff recognise the user by the name we send on create.
 */
function stableUserId(m: MemberPick): string {
  let h = 5381;
  const input = `${m.subjectKind}:${m.subjectId}`;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return String((h % 2_000_000_000) + 1);
}

function BiostarPanel({
  selected,
  detail,
  relay,
}: {
  selected: MemberPick;
  detail: MemberDetail | null;
  relay: BiostarRelay;
}) {
  const { relayUrl, health, checking, recheck } = relay;
  const [assignOpen, setAssignOpen] = useState(false);

  const configured = !!relayUrl;

  return (
    <Card className="border-l-4 border-l-primary/50">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <DoorOpen className="h-4 w-4 text-muted-foreground" />
              BioStar door access
            </CardTitle>
            <CardDescription>
              Create or update this member in BioStar via the on-premises relay and set their door
              access groups. Cards are managed in the Access cards panel above.
            </CardDescription>
          </div>
          {/* Connection chip */}
          {relayUrl === null ? (
            <Skeleton className="h-6 w-24" />
          ) : !configured ? (
            <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <WifiOff className="h-3 w-3" />
              Not configured
            </Badge>
          ) : (
            <button
              type="button"
              onClick={recheck}
              title="Re-check relay"
              className="shrink-0"
            >
              <Badge
                variant="outline"
                className={cn(
                  "gap-1",
                  checking
                    ? "text-muted-foreground"
                    : health?.ok
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {checking ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : health?.ok ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                {checking ? "Checking…" : health?.ok ? "Relay online" : "Relay offline"}
              </Badge>
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!configured && relayUrl !== null ? (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            No BioStar relay configured. Set{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">integrations.biostar.relay_url</code>{" "}
            in System Settings → BioStar first.
          </div>
        ) : (
          <>
            <Button
              onClick={() => setAssignOpen(true)}
              disabled={!configured || !health?.ok}
            >
              <DoorOpen className="h-4 w-4" />
              Set door access
            </Button>
            {health && !health.ok && health.error && (
              <p className="text-xs text-destructive">{health.error}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Shows <span className="font-medium">{selected.name}</span>&apos;s current BioStar door
              groups, then creates/updates the user and sets their door access groups.
            </p>
          </>
        )}
      </CardContent>

      {assignOpen && relayUrl && (
        <BiostarAssignDialog
          relayUrl={relayUrl}
          selected={selected}
          detail={detail}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </Card>
  );
}

// ─── BioStar assign dialog ───────────────────────────────────────────────────────

function BiostarAssignDialog({
  relayUrl,
  selected,
  detail,
  onClose,
}: {
  relayUrl: string;
  selected: MemberPick;
  detail: MemberDetail | null;
  onClose: () => void;
}) {
  const userId = stableUserId(selected);
  const validUntil = detail?.membership?.validUntil ?? undefined;

  const [groups, setGroups] = useState<BiostarAccessGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [steps, setSteps] = useState<StepResult[] | null>(null);

  // The member's CURRENT BioStar state — so the dialog shows reality and pre-selects
  // their existing door groups (check to add, uncheck to remove).
  const [current, setCurrent] = useState<BiostarUserState | null>(null);
  const [currentLoading, setCurrentLoading] = useState(true);
  const [currentError, setCurrentError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setCurrentLoading(true);
    setCurrentError(null);
    try {
      const u = await getBiostarUser(relayUrl, userId);
      setCurrent(u);
      setSelectedGroupIds(u.accessGroupIds); // pre-select current groups
    } catch (err) {
      setCurrent(null);
      setCurrentError(err instanceof Error ? err.message : "Couldn't read current BioStar state");
    } finally {
      setCurrentLoading(false);
    }
  }, [relayUrl, userId]);
  useEffect(() => {
    loadState();
  }, [loadState]);

  // Load access groups for the multi-select.
  useEffect(() => {
    let active = true;
    (async () => {
      setGroupsLoading(true);
      try {
        const rows = await listAccessGroups(relayUrl);
        if (active) setGroups(rows);
      } catch (err) {
        if (active) toast.error(err instanceof Error ? err.message : "Failed to load access groups");
      } finally {
        if (active) setGroupsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [relayUrl]);

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  }

  async function submit() {
    setSubmitting(true);
    setSteps(null);
    try {
      const result = await assignCardAndAccess({
        relayUrl,
        name: selected.name,
        userId,
        // Cards are managed in the Access cards panel — this dialog touches only the
        // user + door groups.
        accessGroupIds: selectedGroupIds,
        // Only touch door groups when we actually know the current state, so a failed
        // read can never silently wipe them.
        applyGroups: !currentError,
        expiry: validUntil,
      });
      setSteps(result);
      if (result.every((s) => s.ok)) {
        toast.success(current?.exists ? "Updated in BioStar" : "Created in BioStar");
        loadState(); // reflect the new reality (groups)
      } else {
        toast.error("Some steps failed — see details below.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Push failed");
    } finally {
      setSubmitting(false);
    }
  }

  const allOk = steps !== null && steps.every((s) => s.ok);
  const actionLabel = current?.exists ? "Update in BioStar" : "Create in BioStar";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>BioStar door access</DialogTitle>
          <DialogDescription>
            Sync <span className="font-medium text-foreground">{selected.name}</span> into BioStar —
            create or update the user and set their door access groups. User&nbsp;ID{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{userId}</code>
            {validUntil ? " · expiry from membership" : " · default expiry"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current BioStar state for this member */}
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            {currentLoading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Reading current BioStar state…
              </span>
            ) : currentError ? (
              <span className="flex items-center justify-between gap-2">
                <span className="text-amber-600 dark:text-amber-400">Couldn&apos;t read BioStar — {currentError}</span>
                <Button variant="ghost" size="sm" className="h-7" onClick={loadState}>
                  Retry
                </Button>
              </span>
            ) : current?.exists ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  >
                    <Wifi className="h-3 w-3" /> In BioStar
                  </Badge>
                  <span className="text-muted-foreground">
                    {current.cards.length} card{current.cards.length === 1 ? "" : "s"}
                    {current.accessGroupNames.length > 0
                      ? ` · ${current.accessGroupNames.join(", ")}`
                      : " · no door groups"}
                  </span>
                </div>
                {current.cards.length > 0 && (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Cards: {current.cards.map((c) => c.number).join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">Not in BioStar yet — saving will create the user.</span>
            )}
          </div>

          {/* Access groups multi-select */}
          <div className="space-y-2">
            <Label>Door access groups</Label>
            {groupsLoading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : groups.length === 0 ? (
              <p className="text-xs text-muted-foreground">No access groups found in BioStar.</p>
            ) : (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                {groups.map((g) => {
                  const checked = selectedGroupIds.includes(g.id);
                  return (
                    <label
                      key={g.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleGroup(g.id)} />
                      <span className="truncate">{g.name || g.id}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {currentError
                ? "Current groups unknown — door groups won't be changed on save."
                : "The member's BioStar door groups — check to add, uncheck to remove."}
            </p>
          </div>

          {/* Per-step result */}
          {steps && (
            <div className="space-y-1.5 rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">Result</p>
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {s.ok ? (
                    <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span>
                    <span className="font-medium">{s.label}:</span>{" "}
                    <span className={cn(!s.ok && "text-destructive")}>{s.message}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {allOk ? "Close" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={submitting || currentLoading}>
            <DoorOpen className="h-4 w-4" />
            {submitting ? "Saving…" : steps ? "Save again" : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
