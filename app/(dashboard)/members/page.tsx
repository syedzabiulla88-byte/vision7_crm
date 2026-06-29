"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { api, uploadFile } from "@/lib/api";
import { cn } from "@/lib/utils";
import { idExpiryStatus, toDateInputValue } from "@/lib/id-expiry";
import { NATIONALITY_OPTIONS } from "@/lib/nationalities";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  addDays,
  differenceInCalendarDays,
  isSameDay,
  isBefore,
  isSameMonth,
  startOfDay,
  format,
} from "date-fns";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Pagination } from "@/components/shared/pagination";
import { PermissionGate } from "@/components/shared/permission-gate";
import { usePermissions } from "@/components/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  Plus,
  Minus,
  Search,
  Trash,
  SquarePen,
  Close,
  Users as UsersIcon,
  UsersMultiple,
  Share2,
  Clock,
  PlayCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Warning,
  Copy,
} from "@/lib/icons";

// ─── Domain constants (ported from site/src/app/admin/members/page.js) ──────────

const STATUS_LIST = ["ALL", "ACTIVE", "PENDING", "EXPIRED", "SUSPENDED", "FROZEN", "CANCELLED"] as const;

const PAGE_SIZE = 20;

const LANGUAGE_OPTIONS = [
  { value: "ARABIC", label: "Arabic" },
  { value: "ENGLISH", label: "English" },
];

const CLIENT_GOAL_OPTIONS = [
  { value: "WEIGHT_LOSS", label: "Weight Loss" },
  { value: "MUSCLE_BUILDING", label: "Muscle Building" },
  { value: "IMPROVE_FITNESS", label: "Improve Fitness Level" },
  { value: "BETTER_SOCIAL_LIFE", label: "Better Social Life" },
  { value: "POST_INJURY_REHAB", label: "Post-Injury Rehabilitation" },
  { value: "IMPROVE_FLEXIBILITY", label: "Improve Flexibility" },
  { value: "EVENT_PREPARATION", label: "Event/Competition Preparation" },
  { value: "STRESS_RELIEF", label: "Stress Relief / Mental Wellbeing" },
];

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

const POSITION_OPTIONS = [
  { value: "GOALKEEPER", label: "Goalkeeper" },
  { value: "DEFENDER", label: "Defender" },
  { value: "MIDFIELDER", label: "Midfielder" },
  { value: "FORWARD", label: "Forward" },
];

const ID_TYPE_OPTIONS = [
  { value: "NATIONAL_ID", label: "National ID" },
  { value: "IQAMA", label: "Iqama" },
  { value: "PASSPORT", label: "Passport" },
];

const LEISURE_INTERESTS = ["gym", "padel", "swim", "rooftop", "wellness", "nutrition"];

const FAMILY_ID_TYPES = ["NATIONAL_ID", "IQAMA", "PASSPORT"];

const RELATION_OPTIONS = [
  { value: "SPOUSE", label: "Spouse" },
  { value: "CHILD", label: "Child" },
  { value: "PARENT", label: "Parent" },
  { value: "SIBLING", label: "Sibling" },
  { value: "OTHER", label: "Other" },
];

const STATUS_OPTIONS = ["PENDING", "ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED"];

// ─── Small format helpers (no shared format lib in the CRM app yet) ─────────────

function formatSAR(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** YYYY-MM-DD for <input type="date">. */
function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// ─── Row helpers ────────────────────────────────────────────────────────────────

type Membership = any;

/**
 * A person row from api.memberships.listGrouped — one entry per human, with that
 * person's full membership objects nested under `memberships` (best-status-first).
 */
interface Person {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  idNumber: string | null;
  idExpiry: string | null;
  avatar: string | null;
  contactId: string | null;
  contactType: "MEMBER" | "CUSTOMER" | "LEAD" | "FORMER" | null;
  athleteId: string | null;
  userId: string | null;
  isDependent?: boolean;
  memberships: Membership[];
  membershipCount: number;
  activeCount: number;
  primaryStatus: string | null;
  // Household / family-package fields (from api.memberships.listGrouped). When the
  // person is a family-package payer, their covered members are nested here and
  // hidden from the top level by the backend.
  isHousehold?: boolean;
  householdCount?: number;
  householdMembers?: Array<{
    name: string;
    contactId: string | null;
    athleteId: string | null;
    service: string | null;
    status: string;
    side: "ACADEMY" | "LEISURE";
  }>;
}

/**
 * A membership row carries a CRM contact id when the member exists in the CRM —
 * directly for leisure members, or via the linked athlete (backend resolves the
 * academy athlete's linked contact onto athlete.crmContactId) so family works for
 * every member, not just leisure.
 */
function contactIdOf(m: Membership): string | null {
  return (
    m?.crmContactId ||
    m?.crmContact?.id ||
    (m?.athlete as { crmContactId?: string } | undefined)?.crmContactId ||
    null
  );
}

/** Family linking is offered only to holders of a family-package plan. */
function hasFamilyPlan(p: Person): boolean {
  return (p.memberships || []).some(
    (m) => !!(m.plan as { isFamilyPlan?: boolean } | undefined)?.isFamilyPlan,
  );
}

/** Remaining-sessions readout + use/restore for session-pack memberships (1-2-1, PT). */
function SessionControl({
  m,
  onAdjust,
  busy,
}: {
  m: Membership;
  onAdjust: (m: Membership, delta: number) => void;
  busy?: boolean;
}) {
  const total = (m as { sessionsTotal?: number | null }).sessionsTotal;
  if (total == null) return null;
  const remaining = (m as { sessionsRemaining?: number | null }).sessionsRemaining ?? total;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>
        Sessions: <span className="font-medium text-foreground">{remaining}</span> / {total}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        className="h-5 w-5"
        disabled={busy || remaining <= 0}
        onClick={() => onAdjust(m, -1)}
        title="Use a session"
        aria-label="Use a session"
      >
        <Minus className="size-3" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        className="h-5 w-5"
        disabled={busy || remaining >= total}
        onClick={() => onAdjust(m, 1)}
        title="Restore a session"
        aria-label="Restore a session"
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}

/** Best-available display name for a membership row. */
function displayName(m: Membership): string {
  if (m?.athlete) return `${m.athlete.firstName || ""} ${m.athlete.lastName || ""}`.trim();
  if (m?.crmContact) return `${m.crmContact.firstName || ""} ${m.crmContact.lastName || ""}`.trim();
  if (m?.user?.name) return m.user.name;
  return "";
}

function statusVariant(status: unknown): "default" | "secondary" | "destructive" | "outline" {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "ACTIVE":
      return "default";
    case "PENDING":
      return "secondary";
    case "EXPIRED":
    case "CANCELLED":
      return "destructive";
    case "FROZEN":
    case "SUSPENDED":
    default:
      return "outline";
  }
}

/** CRM classification badge — Member reads "active customer", everything else muted. */
function contactTypeBadge(
  type: Person["contactType"],
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } | null {
  switch (type) {
    case "MEMBER":
      return { label: "Member", variant: "default" };
    case "CUSTOMER":
      return { label: "Customer", variant: "secondary" };
    case "LEAD":
      return { label: "Lead", variant: "outline" };
    case "FORMER":
      return { label: "Former", variant: "destructive" };
    default:
      return null;
  }
}

/**
 * Small badge flagging an expired / soon-to-expire ID. Renders nothing when the
 * shared rule returns null (no date, or comfortably in the future). Red tone =
 * already expired, amber tone = expiring within 30 days.
 */
function IdExpiryBadge({ value }: { value?: string | Date | null }) {
  const status = idExpiryStatus(value);
  if (!status) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        status.tone === "red"
          ? "border-destructive/40 bg-destructive/10 text-destructive dark:bg-destructive/20"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
      title={status.label}
    >
      {status.label}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const canEdit = can("members:edit");
  const canDelete = can("members:delete");
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "ACADEMY" | "LEISURE">("ALL");
  const [trainerFilter, setTrainerFilter] = useState<string>("");
  const [coaches, setCoaches] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null>(null);
  // Which multi-membership person rows are expanded (keyed by Person.key).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [showAssign, setShowAssign] = useState(false);
  // Pre-selected contact when arriving from a contact's "Convert to member" button
  // (Contacts route here for plan assignment via ?assign=<contactId>).
  const [assignContact, setAssignContact] = useState<{
    id: string; firstName: string; lastName: string; name: string;
    email?: string | null; phone?: string | null; type?: string | null; linkedAthleteId?: string | null;
  } | null>(null);
  const searchParams = useSearchParams();
  useEffect(() => {
    const cid = searchParams.get("assign");
    if (!cid) return;
    let cancelled = false;
    (async () => {
      try {
        const c = (await api.crm.get(cid)) as any;
        if (!cancelled && c?.id) {
          setAssignContact({
            id: c.id,
            firstName: c.firstName || "",
            lastName: c.lastName || "",
            name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Member",
            email: c.email,
            phone: c.phone,
            type: c.type,
            linkedAthleteId: c.linkedAthleteId,
          });
          setShowAssign(true);
        }
      } catch {
        /* ignore — fall back to manual search */
      } finally {
        router.replace("/members"); // drop the param so refresh/back doesn't reopen
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [familyMembership, setFamilyMembership] = useState<Membership | null>(null);
  const [familyContactId, setFamilyContactId] = useState<string | null>(null);
  // The family-package (anchor) membership id — covered members link to this.
  const [familyAnchorMembershipId, setFamilyAnchorMembershipId] = useState<string | null>(null);
  const [familyBusy, setFamilyBusy] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Membership | null>(null);
  const [freezeTarget, setFreezeTarget] = useState<Membership | null>(null);
  const [unfreezeTarget, setUnfreezeTarget] = useState<Membership | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Server-side, person-grouped fetch. listGrouped returns ONE entry per human
  // with their memberships nested, and applies search / status / side filters +
  // person-level pagination server-side — so there is no client-side filtering.
  const load = useCallback(
    async (
      search = "",
      pageArg = 1,
      status = "ALL",
      side: "ALL" | "ACADEMY" | "LEISURE" = "ALL",
      trainer = "",
    ) => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, unknown> = { page: pageArg, limit: PAGE_SIZE };
        const term = search.trim();
        if (term) params.search = term;
        if (status !== "ALL") params.status = status;
        if (side !== "ALL") params.type = side;
        if (trainer) params.trainerId = trainer;
        const result = await api.memberships.listGrouped(params);
        const rows: Person[] = Array.isArray(result) ? result : result?.data || [];
        setPeople(rows);
        setMeta(Array.isArray(result) ? null : result?.meta ?? null);
      } catch (err: any) {
        setError(err?.message || "Failed to load members");
        toast.error(err?.message || "Failed to load members");
      } finally {
        setLoading(false);
        setInitialLoaded(true);
      }
    },
    [],
  );

  // Debounce the search term (~300ms) and re-query the server when search, page,
  // status, side or trainer changes — all filtering happens server-side now.
  useEffect(() => {
    const t = setTimeout(
      () => load(query, page, statusFilter, typeFilter, trainerFilter),
      300,
    );
    return () => clearTimeout(t);
  }, [query, page, statusFilter, typeFilter, trainerFilter, load]);

  // Coach pool for the trainer filter — loaded once.
  useEffect(() => {
    api.users
      .list({ role: "COACH", limit: 100 })
      .then((res: any) => setCoaches(Array.isArray(res) ? res : res?.data || []))
      .catch(() => setCoaches([]));
  }, []);

  // Re-query keeping the current filters + page so the list doesn't reset after
  // create / edit / freeze actions.
  const reload = useCallback(
    () => load(query, page, statusFilter, typeFilter, trainerFilter),
    [load, query, page, statusFilter, typeFilter, trainerFilter],
  );

  const memberLabel = (m: Membership) => displayName(m) || "this membership";

  // Open the family dialog for a person. Leisure/linked members already have a
  // contact anchor; pure academy athletes get one provisioned on demand so family
  // linking works for them too (FamilyMember is anchored on a CrmContact).
  const openFamily = async (person: Person, membership: Membership) => {
    let cid = person.contactId || contactIdOf(membership);
    if (!cid && person.athleteId) {
      setFamilyBusy(person.athleteId);
      try {
        const res = (await api.athletes.ensureContact(person.athleteId)) as { id?: string; data?: { id?: string } };
        cid = res?.id || res?.data?.id || null;
      } catch {
        setFamilyBusy(null);
        toast.error("Couldn't prepare family linking for this member");
        return;
      }
      setFamilyBusy(null);
    }
    if (!cid) {
      toast.error("This member has no contact to link family to");
      return;
    }
    // The covered members anchor on the person's family-package membership.
    const anchor =
      (person.memberships || []).find(
        (m) => !!(m.plan as { isFamilyPlan?: boolean } | undefined)?.isFamilyPlan,
      ) || membership;
    setFamilyContactId(cid);
    setFamilyMembership(membership);
    setFamilyAnchorMembershipId(anchor?.id || null);
  };

  // Use / restore a session on a pack membership, then refresh.
  const adjustSession = async (m: Membership, delta: number) => {
    setSessionBusy(m.id);
    try {
      await api.memberships.useSession(m.id, delta);
      reload();
    } catch {
      toast.error("Couldn't update sessions");
    } finally {
      setSessionBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      await api.memberships.delete(deleteTarget.id);
      toast.success(`Deleted membership for ${memberLabel(deleteTarget)}`);
      setDeleteTarget(null);
      await reload();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete membership");
    } finally {
      setActionBusy(false);
    }
  };

  const confirmUnfreeze = async () => {
    if (!unfreezeTarget) return;
    setActionBusy(true);
    try {
      await api.memberships.unfreeze(unfreezeTarget.id);
      toast.success(`Unfroze ${memberLabel(unfreezeTarget)}'s membership`);
      setUnfreezeTarget(null);
      await reload();
    } catch (err: any) {
      toast.error(err?.message || "Failed to unfreeze membership");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Active, pending and expired memberships across both academy and leisure. Add a new member (academy athlete or leisure customer) and assign a plan."
        onRefresh={reload}
        actions={
          <>
            <PermissionGate permission="members:create">
              <Button variant="outline" onClick={() => setShowAddMember(true)}>
                <Plus />
                New Member
              </Button>
            </PermissionGate>
            <PermissionGate permission="memberships:allocate">
              <Button onClick={() => setShowAssign(true)}>
                <Plus />
                Assign Membership
              </Button>
            </PermissionGate>
          </>
        }
      />

      {/* Type filter (academy vs leisure) + trainer filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Side</span>
        {(
          [
            { v: "ALL", label: "All" },
            { v: "ACADEMY", label: "Academy" },
            { v: "LEISURE", label: "Leisure" },
          ] as const
        ).map((t) => (
          <Button
            key={t.v}
            size="sm"
            variant={typeFilter === t.v ? "default" : "outline"}
            onClick={() => {
              setTypeFilter(t.v);
              setPage(1);
            }}
          >
            {t.label}
          </Button>
        ))}
        <div className="md:ml-auto md:w-56">
          <ComboField
            value={trainerFilter}
            onChange={(v) => {
              setTrainerFilter(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "All trainers" },
              ...coaches.map((c) => ({
                value: c.id,
                label: c.name || c.email || "(unnamed)",
              })),
            ]}
            placeholder="All trainers"
          />
        </div>
      </div>

      {/* Status filter + search */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex flex-wrap gap-2">
          {STATUS_LIST.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
            >
              {s}
            </Button>
          ))}
        </div>
        <div className="relative md:ml-auto md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, phone or ID"
            className="pl-9"
            aria-label="Search members"
          />
        </div>
      </div>

      {/* Table — one row per PERSON; people with several memberships expand to
          show each membership (academy + leisure, renewals, pending) in place. */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Plan / membership</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  Loading members…
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-destructive">{error}</p>
                    <Button variant="outline" size="sm" onClick={reload}>
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : people.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UsersMultiple className="h-8 w-8 opacity-40" />
                    <p>
                      {query.trim()
                        ? "No members match your search."
                        : "No members match your filters."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              people.map((p) => {
                const memberships = p.memberships ?? [];
                const primary = memberships[0];
                const multi = p.membershipCount > 1;
                const householdMembers = p.householdMembers ?? [];
                const hasHousehold = !!p.isHousehold && householdMembers.length > 0;
                // A row expands if it has several memberships OR a covered household.
                const expandable = multi || hasHousehold;
                const isOpen = expanded.has(p.key);
                const typeBadge = contactTypeBadge(p.contactType);
                const primaryFrozen =
                  String(primary?.status || "").toUpperCase() === "FROZEN";
                return (
                  <Fragment key={p.key}>
                    <TableRow>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {expandable ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(p.key)}
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={isOpen ? "Collapse details" : "Expand details"}
                              aria-expanded={isOpen}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          ) : (
                            <span className="w-5 shrink-0" />
                          )}
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{(p.name.charAt(0) || "?").toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium">{p.name || "—"}</p>
                              {typeBadge && (
                                <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
                              )}
                              {p.isHousehold && (
                                <Badge variant="secondary" title="Family package">
                                  {"\u{1F468}‍\u{1F469}‍\u{1F466}"} Family
                                  {(p.householdCount ?? p.householdMembers?.length ?? 0) > 0
                                    ? ` · ${p.householdCount ?? p.householdMembers?.length}`
                                    : ""}
                                </Badge>
                              )}
                            </div>
                            {p.email && (
                              <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
                          <p className="truncate">{p.phone || "—"}</p>
                          {p.idNumber && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate font-mono">ID {p.idNumber}</p>
                              <IdExpiryBadge value={p.idExpiry} />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {multi ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(p.key)}
                            className="text-left"
                          >
                            <span className="font-medium">{primary?.plan?.name || "—"}</span>
                            <span className="ml-1 text-xs text-muted-foreground">
                              +{p.membershipCount - 1} more
                            </span>
                          </button>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span>{primary?.plan?.name || "—"}</span>
                              {primary && (
                                <Badge variant={statusVariant(primary.status)}>
                                  {primary.status || "—"}
                                </Badge>
                              )}
                            </div>
                            {primary?.trainerName && (
                              <p className="text-xs text-muted-foreground">PT: {primary.trainerName}</p>
                            )}
                            {primary && (
                              <SessionControl m={primary} onAdjust={adjustSession} busy={sessionBusy === primary.id} />
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(p.primaryStatus)}>
                          {p.primaryStatus || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {p.contactId && (
                            <Button
                              variant="outline"
                              size="icon-sm"
                              render={<Link href={`/crm/${p.contactId}`} />}
                              title="Open in CRM"
                              aria-label="Open in CRM"
                            >
                              <Share2 />
                            </Button>
                          )}
                          {hasFamilyPlan(p) && (p.contactId || p.athleteId) && primary && !p.isDependent && (
                            <Button
                              variant="outline"
                              size="icon-sm"
                              onClick={() => openFamily(p, primary)}
                              disabled={!!familyBusy && familyBusy === p.athleteId}
                              title="Family members"
                              aria-label="Family members"
                            >
                              <UsersIcon />
                            </Button>
                          )}
                          {/* Single-membership people get inline membership actions;
                              for multi they live in the expanded sub-rows. */}
                          {!multi && primary && (
                            <>
                              {canEdit &&
                                (primaryFrozen ? (
                                  <Button
                                    variant="outline"
                                    size="icon-sm"
                                    onClick={() => setUnfreezeTarget(primary)}
                                    title="Unfreeze membership"
                                    aria-label="Unfreeze membership"
                                  >
                                    <PlayCircle />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="icon-sm"
                                    onClick={() => setFreezeTarget(primary)}
                                    title="Freeze membership"
                                    aria-label="Freeze membership"
                                  >
                                    <Clock />
                                  </Button>
                                ))}
                              {canEdit && (
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  onClick={() => setEditing(primary)}
                                  title="Edit"
                                  aria-label="Edit membership"
                                >
                                  <SquarePen />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  variant="destructive"
                                  size="icon-sm"
                                  onClick={() => setDeleteTarget(primary)}
                                  title="Delete"
                                  aria-label="Delete membership"
                                >
                                  <Trash />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded sub-rows — one line per membership, with that
                        membership's own status + dates + per-membership actions. */}
                    {multi &&
                      isOpen &&
                      memberships.map((m) => {
                        const subFrozen = String(m.status || "").toUpperCase() === "FROZEN";
                        return (
                          <TableRow key={m.id} className="bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={2}>
                              <div className="flex flex-wrap items-center gap-2 pl-7">
                                <span className="text-sm font-medium">{m.plan?.name || "—"}</span>
                                <Badge variant={statusVariant(m.status)}>{m.status || "—"}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(m.startDate)} – {formatDate(m.endDate)}
                                </span>
                                {m.trainerName && (
                                  <span className="text-xs text-muted-foreground">PT: {m.trainerName}</span>
                                )}
                                <SessionControl m={m} onAdjust={adjustSession} busy={sessionBusy === m.id} />
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatSAR(m.price ?? m.plan?.price)}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                {canEdit &&
                                  (subFrozen ? (
                                    <Button
                                      variant="outline"
                                      size="icon-sm"
                                      onClick={() => setUnfreezeTarget(m)}
                                      title="Unfreeze membership"
                                      aria-label="Unfreeze membership"
                                    >
                                      <PlayCircle />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="icon-sm"
                                      onClick={() => setFreezeTarget(m)}
                                      title="Freeze membership"
                                      aria-label="Freeze membership"
                                    >
                                      <Clock />
                                    </Button>
                                  ))}
                                {canEdit && (
                                  <Button
                                    variant="outline"
                                    size="icon-sm"
                                    onClick={() => setEditing(m)}
                                    title="Edit"
                                    aria-label="Edit membership"
                                  >
                                    <SquarePen />
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button
                                    variant="destructive"
                                    size="icon-sm"
                                    onClick={() => setDeleteTarget(m)}
                                    title="Delete"
                                    aria-label="Delete membership"
                                  >
                                    <Trash />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}

                    {/* Household sub-rows — members covered by this person's family
                        package. Each is a free, linked membership; shown read-only
                        here (managed via the Family dialog). */}
                    {hasHousehold && isOpen && (
                      <>
                        <TableRow className="bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={4}>
                            <p className="pl-7 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Covered by family package ({householdMembers.length})
                            </p>
                          </TableCell>
                        </TableRow>
                        {householdMembers.map((hm, i) => (
                          <TableRow key={`${p.key}-hh-${i}`} className="bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={3}>
                              <div className="flex flex-wrap items-center gap-2 pl-7">
                                <span className="text-sm font-medium">{hm.name || "—"}</span>
                                <span className="text-xs text-muted-foreground">
                                  {hm.service || "—"}
                                </span>
                                <Badge variant={statusVariant(hm.status)}>
                                  {hm.status || "—"}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {hm.side === "ACADEMY" ? "Academy" : "Leisure"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={meta?.total ?? people.length}
        totalPages={meta?.totalPages ?? 1}
        onPageChange={setPage}
      />

      {/* Dialogs */}
      {showAssign && (
        <AssignMembershipDialog
          initialContact={assignContact}
          onClose={() => {
            setShowAssign(false);
            setAssignContact(null);
          }}
          onCreated={() => {
            setShowAssign(false);
            setAssignContact(null);
            reload();
          }}
        />
      )}

      {showAddMember && (
        <NewMemberDialog
          onClose={() => setShowAddMember(false)}
          onCreated={(result) => {
            setShowAddMember(false);
            if (result?.type === "LEISURE" && result.email) {
              // Leisure members live in CRM (no athlete record). Send admin
              // there so they can see + tag + assign a plan in context.
              router.push(`/crm?q=${encodeURIComponent(result.email)}`);
            } else {
              reload();
            }
          }}
        />
      )}

      {editing && (
        <EditMembershipDialog
          membership={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {familyMembership && familyContactId && familyAnchorMembershipId && (
        <FamilyMembersDialog
          contactId={familyContactId}
          membershipId={familyMembership.id}
          anchorMembershipId={familyAnchorMembershipId}
          memberName={displayName(familyMembership) || familyMembership.plan?.name || "this member"}
          onChanged={reload}
          onClose={() => {
            setFamilyMembership(null);
            setFamilyContactId(null);
            setFamilyAnchorMembershipId(null);
          }}
        />
      )}

      {/* Freeze — replaces window.prompt with a proper dialog */}
      {freezeTarget && (
        <FreezeDialog
          membership={freezeTarget}
          memberName={memberLabel(freezeTarget)}
          onClose={() => setFreezeTarget(null)}
          onFrozen={() => {
            setFreezeTarget(null);
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete membership"
        description={`Delete membership for ${deleteTarget ? memberLabel(deleteTarget) : ""}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={actionBusy}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={!!unfreezeTarget}
        onOpenChange={(o) => !o && setUnfreezeTarget(null)}
        title="Unfreeze membership"
        description={`Unfreeze ${unfreezeTarget ? memberLabel(unfreezeTarget) : ""}'s membership and reactivate it?`}
        confirmLabel="Unfreeze"
        loading={actionBusy}
        onConfirm={confirmUnfreeze}
      />
    </div>
  );
}

// ─── Shared field wrapper ────────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

// ─── New Member dialog ───────────────────────────────────────────────────────────

interface NewMemberForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  nationality: string;
  dob: string;
  position: string;
  jerseyNumber: string;
  idType: string;
  idNumber: string;
  idExpiry: string;
  idDocumentUrl: string;
  passportNumber: string;
  passportDocumentUrl: string;
  interests: string[];
  notes: string;
  clientGoal: string;
  preferredLanguage: string;
  planId: string;
  startDate: string;
  endDate: string;
  billingMode: "now" | "deposit" | "later" | "tabby" | "tamara" | "manual";
  depositAmount: string;
  paymentMethod: string;
  paymentReference: string;
  bnplProvider: "tabby" | "tamara";
}

const EMPTY_NEW_MEMBER: NewMemberForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  gender: "",
  nationality: "",
  dob: "",
  position: "MIDFIELDER",
  jerseyNumber: "0",
  idType: "NATIONAL_ID",
  idNumber: "",
  idExpiry: "",
  idDocumentUrl: "",
  passportNumber: "",
  passportDocumentUrl: "",
  interests: [],
  notes: "",
  clientGoal: "",
  preferredLanguage: "",
  planId: "",
  startDate: toDateInput(new Date()),
  endDate: "",
  billingMode: "now",
  depositAmount: "",
  paymentMethod: "cash",
  paymentReference: "",
  bnplProvider: "tabby",
};

function NewMemberDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: { type: "ACADEMY" | "LEISURE"; email: string }) => void;
}) {
  const [memberType, setMemberType] = useState<"ACADEMY" | "LEISURE">("ACADEMY");
  const [form, setForm] = useState<NewMemberForm>(EMPTY_NEW_MEMBER);
  const [uploads, setUploads] = useState({ id: false, passport: false });
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  // Gateway availability — disables Tabby/Tamara when keys aren't configured.
  const [providers, setProviders] = useState<
    Array<{ provider: "tabby" | "tamara" | "stripe"; enabled: boolean }>
  >([]);
  // Pay-link returned by assign for tabby/tamara — shown with a Copy button.
  const [payLink, setPayLink] = useState<{ url: string; provider: string } | null>(null);

  const set = <K extends keyof NewMemberForm>(k: K, v: NewMemberForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Load plans once so a real plan can be attached at member creation.
  useEffect(() => {
    api.plans
      .list({ limit: 1000 })
      .then((res: any) => setPlans(Array.isArray(res) ? res : res?.data || []))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  // Which BNPL gateways are configured.
  useEffect(() => {
    api.payments
      .providers()
      .then((res) => setProviders(Array.isArray(res) ? res : []))
      .catch(() => setProviders([]));
  }, []);

  // Offer the relevant plans for the chosen side: academy plans for athletes,
  // leisure / personal-training plans for leisure members (fall back to all if
  // a plan has no type set).
  const planOptions = useMemo(() => {
    const visible = plans.filter((p) => {
      const t = String(p.type || "").toUpperCase();
      if (!t) return true;
      return memberType === "ACADEMY" ? t === "ACADEMY" : t !== "ACADEMY";
    });
    return visible.map((p) => ({
      value: p.id,
      label: `${p.name}${p.price != null ? ` — ${formatSAR(p.price)}` : ""}`,
    }));
  }, [plans, memberType]);

  // Clear a selected plan that isn't valid for the current side.
  useEffect(() => {
    if (form.planId && !planOptions.some((o) => o.value === form.planId)) {
      setForm((f) => ({ ...f, planId: "" }));
    }
  }, [planOptions, form.planId]);

  // Auto-fill the end date from the plan's durationDays when plan/start changes.
  useEffect(() => {
    if (!form.planId || !form.startDate) return;
    const plan = plans.find((p) => p.id === form.planId);
    if (plan?.durationDays) {
      const start = new Date(form.startDate);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start);
        end.setDate(end.getDate() + Number(plan.durationDays));
        setForm((f) => ({ ...f, endDate: toDateInput(end) }));
      }
    }
  }, [form.planId, form.startDate, plans]);

  const handleUpload = async (which: "id" | "passport", file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large — keep it under 10 MB");
      return;
    }
    setUploads((u) => ({ ...u, [which]: true }));
    try {
      const { url } = await uploadFile(file, {
        folder: "members/kyc",
        category: file.type.startsWith("image/")
          ? "image"
          : file.type === "application/pdf"
            ? "pdf"
            : "file",
      });
      set(which === "id" ? "idDocumentUrl" : "passportDocumentUrl", url);
      toast.success("Document uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploads((u) => ({ ...u, [which]: false }));
    }
  };

  const toggleInterest = (i: string) => {
    set(
      "interests",
      form.interests.includes(i)
        ? form.interests.filter((x) => x !== i)
        : [...form.interests, i],
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      toast.error("First name, last name and email are required");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    if (!form.gender) {
      toast.error("Select a gender");
      return;
    }
    if (memberType === "ACADEMY" && !form.dob) {
      toast.error("Date of birth is required for academy athletes");
      return;
    }
    // A real member must have a plan — otherwise they never show in the
    // membership-based Members directory. Require it before submit.
    if (!form.planId) {
      toast.error("Select a plan — every member needs one");
      return;
    }

    const planPrice = Number(plans.find((p) => p.id === form.planId)?.price) || 0;

    // Validate the deposit before any network call: must be > 0 and < the plan total.
    const depositNum = Number(form.depositAmount);
    if (planPrice > 0 && form.billingMode === "deposit") {
      if (!Number.isFinite(depositNum) || depositNum <= 0 || depositNum >= planPrice) {
        toast.error(`Deposit must be greater than 0 and less than ${formatSAR(planPrice)}`);
        return;
      }
    }
    // BNPL pay-link modes need their gateway configured (keys in Settings).
    if (planPrice > 0 && (form.billingMode === "tabby" || form.billingMode === "tamara")) {
      if (!providers.find((p) => p.provider === form.billingMode)?.enabled) {
        toast.error(`${form.billingMode === "tabby" ? "Tabby" : "Tamara"} is not configured — add keys in Settings.`);
        return;
      }
    }
    // Manual BNPL reference requires the reference text.
    if (planPrice > 0 && form.billingMode === "manual" && !form.paymentReference.trim()) {
      toast.error("Enter the BNPL payment reference.");
      return;
    }

    setSaving(true);
    const isPayLinkMode = form.billingMode === "tabby" || form.billingMode === "tamara";
    // Billing payload differs by mode:
    //  - paid (free or "now") → payNow:true records payment + activates
    //  - deposit              → depositAmount records a partial payment, membership stays PENDING
    //  - later                → neither, just raises the invoice
    //  - tabby / tamara       → paymentMethod only; backend returns a payLink
    //  - manual               → manual-reference + bnplProvider + paymentReference
    const billingFields: Record<string, unknown> =
      planPrice <= 0
        ? { payNow: true, paymentMethod: form.paymentMethod }
        : form.billingMode === "deposit"
          ? {
              payNow: false,
              depositAmount: depositNum,
              paymentMethod: form.paymentMethod,
              paymentReference: form.paymentReference.trim() || undefined,
            }
          : form.billingMode === "tabby" || form.billingMode === "tamara"
            ? { paymentMethod: form.billingMode }
            : form.billingMode === "manual"
              ? {
                  paymentMethod: "manual-reference",
                  bnplProvider: form.bnplProvider,
                  paymentReference: form.paymentReference.trim(),
                }
              : {
                  payNow: form.billingMode === "now",
                  paymentMethod: form.paymentMethod,
                  paymentReference: form.paymentReference.trim() || undefined,
                };
    const billingToast = (status: string | undefined, label: string) =>
      planPrice <= 0
        ? `${label} — activated (free plan)`
        : form.billingMode === "manual"
          ? `${label} — BNPL reference recorded`
          : form.billingMode === "deposit"
            ? `${label} — deposit recorded, balance owed, membership pending`
            : status === "ACTIVE"
              ? `${label} — payment recorded, membership active`
              : `${label} — invoice raised, membership pending until paid`;
    try {
      if (memberType === "ACADEMY") {
        // Athlete = full academy record (creates linked User + CRM contact server-side)
        const athlete = await api.athletes.create({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          dob: new Date(form.dob).toISOString(),
          position: form.position,
          jerseyNumber: Number(form.jerseyNumber) || 0,
          gender: form.gender,
          nationality: form.nationality.trim() || undefined,
          idType: form.idNumber.trim() ? form.idType : undefined,
          idNumber: form.idNumber.trim() || undefined,
          idExpiry: form.idExpiry || null,
          idDocumentUrl: form.idDocumentUrl || undefined,
          passportNumber: form.passportNumber.trim() || undefined,
          passportDocumentUrl: form.passportDocumentUrl || undefined,
        });
        // Bill for the plan: PENDING membership + invoice; payNow records payment & activates.
        const res = await api.memberships.assign({
          athleteId: athlete.id,
          planId: form.planId,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          ...billingFields,
        });
        if (isPayLinkMode && res?.payLink?.url) {
          setPayLink({ url: res.payLink.url, provider: res.payLink.provider || form.billingMode });
          toast.success(`${form.billingMode === "tamara" ? "Tamara" : "Tabby"} pay-link created`);
        } else {
          toast.success(billingToast(res?.membership?.status, "Academy member created"));
          onCreated({ type: "ACADEMY", email: form.email.trim() });
        }
      } else {
        // Leisure = CRM contact with type=MEMBER + leisure tags + wellness profile
        const contact = await api.crm.create({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim() || undefined,
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          type: "MEMBER",
          source: "admin",
          tags: ["leisure", ...form.interests],
          notes: form.notes.trim() || undefined,
          dob: form.dob ? new Date(form.dob).toISOString() : undefined,
          clientGoal: form.clientGoal || undefined,
          preferredLanguage: form.preferredLanguage || undefined,
          idType: form.idNumber.trim() ? form.idType : undefined,
          nationalId: form.idNumber.trim() || undefined,
          idExpiry: form.idExpiry || null,
        });
        // Bill for the plan: PENDING membership + invoice; payNow records payment & activates.
        const res = await api.memberships.assign({
          crmContactId: contact.id,
          planId: form.planId,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          ...billingFields,
        });
        if (isPayLinkMode && res?.payLink?.url) {
          setPayLink({ url: res.payLink.url, provider: res.payLink.provider || form.billingMode });
          toast.success(`${form.billingMode === "tamara" ? "Tamara" : "Tabby"} pay-link created`);
        } else {
          toast.success(billingToast(res?.membership?.status, "Leisure member created"));
          onCreated({ type: "LEISURE", email: form.email.trim() });
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to create member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b p-6">
            <DialogTitle>New member profile</DialogTitle>
            <DialogDescription>
              Pick a type — academy creates a full athlete record, leisure creates a customer record only.
            </DialogDescription>
          </DialogHeader>

          {/* Type tabs */}
          <div className="grid grid-cols-2 border-b">
            {(
              [
                { v: "ACADEMY", label: "Academy", desc: "Football athlete" },
                { v: "LEISURE", label: "Gym / Leisure", desc: "Gym / Padel / Swim / Rooftop" },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setMemberType(t.v)}
                className={`px-4 py-3 text-left transition-colors ${
                  memberType === t.v
                    ? "bg-primary/10 border-b-2 border-primary"
                    : "border-b-2 border-transparent text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <p className={`text-xs font-semibold uppercase tracking-wide ${memberType === t.v ? "text-primary" : ""}`}>
                  {t.label}
                </p>
                <p className="mt-0.5 text-[10px] opacity-70">{t.desc}</p>
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name *" htmlFor="nm-first">
                <Input
                  id="nm-first"
                  required
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                />
              </Field>
              <Field label="Last name *" htmlFor="nm-last">
                <Input
                  id="nm-last"
                  required
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Email *" htmlFor="nm-email">
              <Input
                id="nm-email"
                required
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone *" htmlFor="nm-phone">
                <Input
                  id="nm-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+966 5X XXX XXXX"
                />
              </Field>
              <Field label="Gender *">
                <SelectField
                  value={form.gender}
                  onChange={(v) => set("gender", v)}
                  options={GENDER_OPTIONS}
                  placeholder="Select gender…"
                />
              </Field>
            </div>

            {memberType === "ACADEMY" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date of birth *" htmlFor="nm-dob">
                    <Input
                      id="nm-dob"
                      required
                      type="date"
                      value={form.dob}
                      onChange={(e) => set("dob", e.target.value)}
                    />
                  </Field>
                  <Field label="Nationality">
                    <ComboField
                      value={form.nationality}
                      onChange={(v) => set("nationality", v)}
                      options={NATIONALITY_OPTIONS}
                      placeholder="Select nationality…"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Position">
                    <SelectField
                      value={form.position}
                      onChange={(v) => set("position", v)}
                      options={POSITION_OPTIONS}
                    />
                  </Field>
                  <Field label="Jersey #" htmlFor="nm-jersey">
                    <Input
                      id="nm-jersey"
                      type="number"
                      min={0}
                      value={form.jerseyNumber}
                      onChange={(e) => set("jerseyNumber", e.target.value)}
                    />
                  </Field>
                </div>

                {/* KYC */}
                <div className="space-y-3 border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Identification (optional but recommended)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="ID type">
                      <SelectField
                        value={form.idType}
                        onChange={(v) => set("idType", v)}
                        options={ID_TYPE_OPTIONS}
                      />
                    </Field>
                    <Field label="ID number" htmlFor="nm-idnum">
                      <Input
                        id="nm-idnum"
                        className="font-mono"
                        value={form.idNumber}
                        onChange={(e) => set("idNumber", e.target.value)}
                        placeholder="e.g. 1234567890"
                      />
                    </Field>
                  </div>
                  <Field label="ID expiry date (optional)" htmlFor="nm-idexpiry">
                    <Input
                      id="nm-idexpiry"
                      type="date"
                      value={form.idExpiry}
                      onChange={(e) => set("idExpiry", e.target.value)}
                    />
                  </Field>
                  <Field label="ID document (image or PDF)">
                    <KycUploadInput
                      busy={uploads.id}
                      url={form.idDocumentUrl}
                      onSelect={(file) => handleUpload("id", file)}
                      onClear={() => set("idDocumentUrl", "")}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Passport number" htmlFor="nm-passnum">
                      <Input
                        id="nm-passnum"
                        className="font-mono"
                        value={form.passportNumber}
                        onChange={(e) => set("passportNumber", e.target.value)}
                        placeholder="A12345678"
                      />
                    </Field>
                    <Field label="Passport document">
                      <KycUploadInput
                        busy={uploads.passport}
                        url={form.passportDocumentUrl}
                        onSelect={(file) => handleUpload("passport", file)}
                        onClear={() => set("passportDocumentUrl", "")}
                      />
                    </Field>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date of birth" htmlFor="nm-dob-l">
                    <Input
                      id="nm-dob-l"
                      type="date"
                      value={form.dob}
                      onChange={(e) => set("dob", e.target.value)}
                    />
                  </Field>
                  <Field label="Nationality">
                    <ComboField
                      value={form.nationality}
                      onChange={(v) => set("nationality", v)}
                      options={NATIONALITY_OPTIONS}
                      placeholder="Select nationality…"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="ID type">
                    <SelectField
                      value={form.idType}
                      onChange={(v) => set("idType", v)}
                      options={ID_TYPE_OPTIONS}
                    />
                  </Field>
                  <Field label="ID number" htmlFor="nm-idnum-l">
                    <Input
                      id="nm-idnum-l"
                      className="font-mono"
                      value={form.idNumber}
                      onChange={(e) => set("idNumber", e.target.value)}
                      placeholder="e.g. 1234567890"
                    />
                  </Field>
                </div>

                <Field label="ID expiry date (optional)" htmlFor="nm-idexpiry-l">
                  <Input
                    id="nm-idexpiry-l"
                    type="date"
                    value={form.idExpiry}
                    onChange={(e) => set("idExpiry", e.target.value)}
                  />
                </Field>

                <Field label="Client goal">
                  <SelectField
                    value={form.clientGoal}
                    onChange={(v) => set("clientGoal", v)}
                    options={CLIENT_GOAL_OPTIONS}
                    placeholder="Select goal…"
                  />
                </Field>

                <Field label="Preferred language">
                  <SelectField
                    value={form.preferredLanguage}
                    onChange={(v) => set("preferredLanguage", v)}
                    options={LANGUAGE_OPTIONS}
                    placeholder="Select language…"
                  />
                </Field>

                <Field label="Interests">
                  <div className="flex flex-wrap gap-2">
                    {LEISURE_INTERESTS.map((i) => {
                      const active = form.interests.includes(i);
                      return (
                        <Button
                          key={i}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          onClick={() => toggleInterest(i)}
                        >
                          {i}
                        </Button>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Notes" htmlFor="nm-notes">
                  <Textarea
                    id="nm-notes"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    placeholder="Anything staff should know"
                  />
                </Field>
              </>
            )}

            {/* Membership — shown for BOTH sides so every new member gets a real
                plan and appears in the membership-based directory. */}
            <div className="space-y-3 border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Membership plan
              </p>
              <Field label="Plan *">
                <SelectField
                  value={form.planId}
                  onChange={(v) => set("planId", v)}
                  options={planOptions}
                  placeholder={plansLoading ? "Loading plans…" : "Select plan…"}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date" htmlFor="nm-start">
                  <Input
                    id="nm-start"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => set("startDate", e.target.value)}
                  />
                </Field>
                <Field label="End date" htmlFor="nm-end">
                  <Input
                    id="nm-end"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => set("endDate", e.target.value)}
                  />
                </Field>
              </div>

              {/* Billing — every membership is billed; no free passes. */}
              {form.planId
                ? (() => {
                    const sp = plans.find((p) => p.id === form.planId);
                    const price = Number(sp?.price) || 0;
                    if (price <= 0) {
                      return (
                        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                          Free plan — no payment required. The membership activates immediately.
                        </div>
                      );
                    }
                    const tabbyEnabled = providers.find((p) => p.provider === "tabby")?.enabled ?? false;
                    const tamaraEnabled = providers.find((p) => p.provider === "tamara")?.enabled ?? false;
                    const bnplDisabled: Record<string, boolean> = { tabby: !tabbyEnabled, tamara: !tamaraEnabled };
                    return (
                      <div className="space-y-3 rounded-md border p-3">
                        <span className="text-sm font-medium">Billing — {formatSAR(price)}</span>
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              { v: "now", label: "Pay in full now" },
                              { v: "deposit", label: "Take a deposit" },
                              { v: "later", label: "Invoice — pay later" },
                              { v: "tabby", label: "Tabby (pay-link)" },
                              { v: "tamara", label: "Tamara (pay-link)" },
                              { v: "manual", label: "Manual BNPL reference" },
                            ] as const
                          ).map((m) => {
                            const disabled = bnplDisabled[m.v] === true;
                            return (
                              <button
                                key={m.v}
                                type="button"
                                disabled={disabled}
                                title={disabled ? "Add keys in Settings" : undefined}
                                onClick={() => set("billingMode", m.v)}
                                className={`rounded-md border px-3 py-2 text-sm ${form.billingMode === m.v ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"} disabled:cursor-not-allowed disabled:opacity-50`}
                              >
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                        {(form.billingMode === "tabby" || form.billingMode === "tamara") &&
                          bnplDisabled[form.billingMode] && (
                            <p className="text-xs text-muted-foreground">Add keys in Settings.</p>
                          )}
                        {form.billingMode === "deposit" && (
                          <Field label="Deposit amount (SAR)" htmlFor="nm-deposit">
                            <Input
                              id="nm-deposit"
                              type="number"
                              min={0}
                              max={price}
                              step="0.01"
                              value={form.depositAmount}
                              onChange={(e) => set("depositAmount", e.target.value)}
                              placeholder={`0 – ${formatSAR(price)}`}
                            />
                            <div className="mt-2 flex gap-2">
                              {[0.25, 0.5, 0.75].map((pct) => (
                                <Button
                                  key={pct}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    set("depositAmount", String(Math.round(price * pct * 100) / 100))
                                  }
                                >
                                  {pct * 100}%
                                </Button>
                              ))}
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              The deposit is recorded as a partial payment. The balance stays owed and
                              the member remains <strong>pending</strong> until paid in full.
                            </p>
                          </Field>
                        )}
                        {form.billingMode === "now" || form.billingMode === "deposit" ? (
                          <>
                            <Field label="Payment method">
                              <SelectField
                                value={form.paymentMethod}
                                onChange={(v) => set("paymentMethod", v)}
                                options={[
                                  { value: "cash", label: "Cash" },
                                  { value: "card", label: "Card" },
                                  { value: "bank-transfer", label: "Bank transfer" },
                                  { value: "cheque", label: "Cheque" },
                                ]}
                              />
                            </Field>
                            <Field label="Reference / Transaction ID" htmlFor="nm-payment-ref">
                              <Input
                                id="nm-payment-ref"
                                value={form.paymentReference}
                                onChange={(e) => set("paymentReference", e.target.value)}
                                placeholder="Transaction ID, cheque no., bank ref…"
                              />
                            </Field>
                          </>
                        ) : form.billingMode === "tabby" || form.billingMode === "tamara" ? (
                          payLink ? (
                            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                              <p className="text-xs font-medium text-foreground">
                                {payLink.provider === "tamara" ? "Tamara" : "Tabby"} pay-link
                              </p>
                              <div className="flex items-center gap-2">
                                <Input readOnly value={payLink.url} className="text-xs" />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    navigator.clipboard
                                      ?.writeText(payLink.url)
                                      .then(() => toast.success("Pay-link copied"))
                                      .catch(() => toast.error("Could not copy"));
                                  }}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Pay-link emailed to {form.email.trim() || "the customer"}.
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              A {form.billingMode === "tamara" ? "Tamara" : "Tabby"} pay-link will be
                              created and emailed to {form.email.trim() || "the customer"}. The membership
                              stays <strong>pending</strong> until they complete payment.
                            </p>
                          )
                        ) : form.billingMode === "manual" ? (
                          <>
                            <Field label="BNPL provider">
                              <SelectField
                                value={form.bnplProvider}
                                onChange={(v) => set("bnplProvider", v === "tamara" ? "tamara" : "tabby")}
                                options={[
                                  { value: "tabby", label: "Tabby" },
                                  { value: "tamara", label: "Tamara" },
                                ]}
                              />
                            </Field>
                            <Field label="Reference / Transaction ID" htmlFor="nm-bnpl-ref">
                              <Input
                                id="nm-bnpl-ref"
                                value={form.paymentReference}
                                onChange={(e) => set("paymentReference", e.target.value)}
                                placeholder="BNPL order / payment reference…"
                              />
                            </Field>
                            <p className="text-xs text-muted-foreground">
                              Records a payment already taken through{" "}
                              {form.bnplProvider === "tamara" ? "Tamara" : "Tabby"} outside the system, by reference.
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            An invoice will be issued. The member stays <strong>pending</strong> (no access) until it&rsquo;s paid.
                          </p>
                        )}
                      </div>
                    );
                  })()
                : null}
            </div>
          </div>

          <DialogFooter className="border-t p-4">
            {payLink ? (
              <Button
                type="button"
                onClick={() => onCreated({ type: memberType, email: form.email.trim() })}
              >
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Create Member"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── KYC file upload input ───────────────────────────────────────────────────────

function KycUploadInput({
  busy,
  url,
  onSelect,
  onClear,
}: {
  busy: boolean;
  url: string;
  onSelect: (file: File | undefined) => void;
  onClear: () => void;
}) {
  if (busy) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground">
        <span className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
        Uploading…
      </div>
    );
  }
  if (url) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
        <Check className="h-4 w-4 text-emerald-500" />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 truncate text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Uploaded — view file
        </a>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onClear} title="Replace">
          <Close />
        </Button>
      </div>
    );
  }
  return (
    <Input
      type="file"
      accept="image/*,application/pdf"
      onChange={(e) => {
        onSelect(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
}

// ─── Reusable select wrapper (label-from-options ItemText) ───────────────────────

function SelectField({
  value,
  onChange,
  options,
  placeholder = "Select…",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(v) => onChange(String(v))}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Searchable combobox wrapper (string value in / out) ─────────────────────────

type ComboOption = { value: string; label: string };

/**
 * Thin wrapper over the base-ui Combobox that keeps the bound value a plain
 * string (like SelectField) while giving a searchable, type-to-filter list.
 * The selected option object is derived from `value` each render so identity
 * matching against `items` stays stable.
 */
function ComboField({
  value,
  onChange,
  options,
  placeholder = "Select…",
}: {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder?: string;
}) {
  const selected = options.find((o) => o.value === value) ?? null;
  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next: ComboOption | null) => onChange(next ? next.value : "")}
      itemToStringLabel={(o: ComboOption) => o.label}
    >
      <ComboboxInput placeholder={placeholder} className="w-full" showClear={!!selected} />
      <ComboboxContent>
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(o: ComboOption) => (
            <ComboboxItem key={o.value} value={o}>
              {o.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

// ─── Edit Membership dialog ──────────────────────────────────────────────────────

function EditMembershipDialog({
  membership,
  onClose,
  onSaved,
}: {
  membership: Membership;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    planId: membership.planId || membership.plan?.id || "",
    status: membership.status || "PENDING",
    startDate: toDateInput(membership.startDate),
    endDate: toDateInput(membership.endDate),
    autoRenew: !!membership.autoRenew,
    notes: membership.notes || "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.plans
      .list({ limit: 1000 })
      .then((res: any) => setPlans(Array.isArray(res) ? res : res?.data || []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.memberships.update(membership.id, {
        planId: form.planId || undefined,
        status: form.status,
        startDate: form.startDate || undefined,
        endDate: form.endDate || null,
        autoRenew: !!form.autoRenew,
        notes: form.notes?.trim() || null,
      });
      toast.success("Membership updated");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save membership");
    } finally {
      setSaving(false);
    }
  };

  const planOptions = plans.map((p) => ({
    value: p.id,
    label: `${p.name}${p.price != null ? ` — ${formatSAR(p.price)}` : ""}`,
  }));
  const headerName = displayName(membership) || "Membership";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b p-6">
            <DialogTitle>{headerName}</DialogTitle>
            <DialogDescription>Adjust plan, dates, status or notes.</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="p-10 text-center text-muted-foreground">Loading plans…</div>
          ) : (
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              <Field label="Plan">
                <SelectField
                  value={form.planId}
                  onChange={(v) => set("planId", v)}
                  options={planOptions}
                  placeholder="Select plan…"
                />
              </Field>

              <Field label="Status">
                <SelectField
                  value={form.status}
                  onChange={(v) => set("status", v)}
                  options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Start date" htmlFor="em-start">
                  <Input
                    id="em-start"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => set("startDate", e.target.value)}
                  />
                </Field>
                <Field label="End date" htmlFor="em-end">
                  <Input
                    id="em-end"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => set("endDate", e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="em-autorenew"
                  checked={form.autoRenew}
                  onCheckedChange={(v) => set("autoRenew", !!v)}
                />
                <Label htmlFor="em-autorenew">Auto-renew at end date</Label>
              </div>

              <Field label="Notes" htmlFor="em-notes">
                <Textarea
                  id="em-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Internal notes (optional)"
                />
              </Field>
            </div>
          )}

          <DialogFooter className="border-t p-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || loading}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Freeze dialog (replaces window.prompt) ──────────────────────────────────────

type FreezeRange = { from?: Date; to?: Date };

/** Lightweight month calendar with inclusive range selection (no extra deps). */
function RangeCalendar({
  value,
  onChange,
  minDate,
}: {
  value: FreezeRange;
  onChange: (r: FreezeRange) => void;
  minDate?: Date;
}) {
  const [month, setMonth] = useState<Date>(startOfMonth(value.from ?? new Date()));
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  });
  const min = minDate ? startOfDay(minDate) : null;
  const { from, to } = value;

  const pick = (d: Date) => {
    if (min && isBefore(d, min)) return;
    if (!from || (from && to)) onChange({ from: d, to: undefined });
    else if (isBefore(d, from)) onChange({ from: d, to: from });
    else onChange({ from, to: d });
  };

  const isEndpoint = (d: Date) => !!((from && isSameDay(d, from)) || (to && isSameDay(d, to)));
  const isMiddle = (d: Date) =>
    !!(from && to && differenceInCalendarDays(d, from) > 0 && differenceInCalendarDays(to, d) > 0);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-sm font-medium">{format(month, "MMMM yyyy")}</span>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase text-muted-foreground">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const disabled = !!(min && isBefore(d, min));
          const outside = !isSameMonth(d, month);
          const end = isEndpoint(d);
          const mid = isMiddle(d);
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => pick(d)}
              className={cn(
                "h-8 rounded text-xs transition-colors",
                end && "bg-[#FFCF01] font-semibold text-[#011b2b]",
                mid && "bg-[#FFCF01]/20",
                !end && !mid && !disabled && "hover:bg-muted",
                outside && !end && !mid && "text-muted-foreground/40",
                disabled && "pointer-events-none opacity-30",
              )}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FreezeDialog({
  membership,
  memberName,
  onClose,
  onFrozen,
}: {
  membership: Membership;
  memberName: string;
  onClose: () => void;
  onFrozen: () => void;
}) {
  const [range, setRange] = useState<FreezeRange>({});
  const [saving, setSaving] = useState(false);

  // Lifetime freeze cap (null = unlimited) + how many days are already used.
  const maxFreezeDays: number | null = membership.plan?.maxFreezeDays ?? null;
  const usedFreezeDays = Number(membership.freezeDays) || 0;
  const remainingDays =
    maxFreezeDays != null ? Math.max(0, maxFreezeDays - usedFreezeDays) : null;

  const freezeDays =
    range.from && range.to ? differenceInCalendarDays(range.to, range.from) + 1 : 0;
  const currentEnd = membership.endDate ? new Date(membership.endDate as string) : null;
  const newExpiry = currentEnd && freezeDays ? addDays(currentEnd, freezeDays) : null;
  const exceedsCap = remainingDays != null && freezeDays > remainingDays;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!range.from || !range.to || freezeDays <= 0) {
      toast.error("Select a freeze date range on the calendar.");
      return;
    }
    if (exceedsCap) {
      toast.error(`That's ${freezeDays} days — the plan allows ${remainingDays} more.`);
      return;
    }
    setSaving(true);
    try {
      await api.memberships.freeze(membership.id, {
        freezeStartDate: toDateInput(range.from),
        freezeDays,
      });
      toast.success(`Froze ${memberName}'s membership for ${freezeDays} day${freezeDays === 1 ? "" : "s"}`);
      onFrozen();
    } catch (err: any) {
      toast.error(err?.message || "Failed to freeze membership");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Freeze membership</DialogTitle>
            <DialogDescription>
              Pick the dates to freeze {memberName}&apos;s membership. The end date is extended by
              the number of frozen days.
            </DialogDescription>
          </DialogHeader>

          <RangeCalendar value={range} onChange={setRange} minDate={new Date()} />

          <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Freeze period</span>
              <span className="font-medium">
                {range.from && range.to
                  ? `${formatDate(range.from)} → ${formatDate(range.to)} (${freezeDays} day${freezeDays === 1 ? "" : "s"})`
                  : "Select a range"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Current expiry</span>
              <span>{currentEnd ? formatDate(currentEnd) : "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">New expiry</span>
              <span className="font-semibold text-[#FFCF01]">
                {newExpiry ? formatDate(newExpiry) : currentEnd ? formatDate(currentEnd) : "—"}
              </span>
            </div>
          </div>

          {maxFreezeDays != null && (
            <p className={cn("text-xs", exceedsCap ? "text-destructive" : "text-muted-foreground")}>
              Max {maxFreezeDays} freeze day{maxFreezeDays === 1 ? "" : "s"} for this plan
              {usedFreezeDays > 0 ? ` · ${usedFreezeDays} used` : ""}
              {remainingDays != null ? ` · ${remainingDays} remaining` : ""}
              {exceedsCap ? " — selection exceeds the cap" : ""}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !range.from || !range.to || exceedsCap}>
              {saving ? "Freezing…" : "Freeze"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Family Members dialog ───────────────────────────────────────────────────────

const EMPTY_FAMILY = {
  firstName: "",
  lastName: "",
  dob: "",
  gender: "",
  relation: "CHILD",
  idType: "NATIONAL_ID",
  idNumber: "",
  school: "",
  notes: "",
};

function FamilyMembersDialog({
  contactId,
  membershipId,
  anchorMembershipId,
  memberName,
  onChanged,
  onClose,
}: {
  contactId: string;
  membershipId: string;
  anchorMembershipId: string;
  memberName: string;
  onChanged?: () => void;
  onClose: () => void;
}) {
  // Covered members — free, active memberships linked to the family-package
  // (anchor) membership. Loaded + managed entirely through the memberships API.
  const [covered, setCovered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Linked members — EXISTING contacts attached to this family who keep their
  // own plan & billing. Managed through the crm family-links API, keyed on the
  // payer's contactId.
  const [linked, setLinked] = useState<any[]>([]);
  const [linkedLoading, setLinkedLoading] = useState(true);
  const [unlinkTarget, setUnlinkTarget] = useState<any | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  // Add mode — "link" (attach an existing person, default) vs "new" (create a
  // brand-new covered member via the rich form).
  const [addMode, setAddMode] = useState<"link" | "new">("link");

  // Link-existing search state.
  const [linkSearch, setLinkSearch] = useState("");
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkResults, setLinkResults] = useState<any[]>([]);
  const [linkRelation, setLinkRelation] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Service plans (non-family). A plan with requiresAthlete is an academy plan.
  const [plans, setPlans] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  // Add-a-member form.
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    relation: "",
    planId: "",
    gender: "",
    dob: "",
    phone: "",
    email: "",
    nationality: "",
    idType: "NATIONAL_ID",
    idNumber: "",
    idExpiry: "",
  });
  const [adding, setAdding] = useState(false);
  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Reference void so unused props don't trip lint — membershipId is kept on the
  // contract for callers/back-compat even though covered members anchor on
  // anchorMembershipId. contactId IS used now for linked family-link management.
  void membershipId;

  const loadCovered = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.memberships.list({
        familyMembershipId: anchorMembershipId,
        limit: 50,
      });
      setCovered(Array.isArray(res) ? res : res?.data || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load covered members");
    } finally {
      setLoading(false);
    }
  }, [anchorMembershipId]);

  // Linked members live on the payer's contact as family links — keep their own
  // plan & billing (or have no plan yet). Normalize array | { data }.
  const loadLinked = useCallback(async () => {
    setLinkedLoading(true);
    try {
      const res = await api.crm.listFamily(contactId);
      setLinked(Array.isArray(res) ? res : res?.data || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load linked members");
    } finally {
      setLinkedLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    loadCovered();
  }, [loadCovered]);

  useEffect(() => {
    loadLinked();
  }, [loadLinked]);

  // Best display name for a linked family-link row — prefer the embedded
  // contact, fall back to denormalized firstName/lastName on the link itself.
  const linkedLabel = useCallback((link: any) => {
    const c = link?.memberContact;
    if (c) return `${c.firstName || ""} ${c.lastName || ""}`.trim() || "this member";
    return `${link?.firstName || ""} ${link?.lastName || ""}`.trim() || "this member";
  }, []);

  // Ids already attached to this family (payer + covered + linked) so the search
  // can hide people who are already in.
  const excludedIds = useMemo(() => {
    const ids = new Set<string>([contactId]);
    for (const m of covered) {
      if (m?.crmContact?.id) ids.add(m.crmContact.id);
    }
    for (const link of linked) {
      const mid = link?.memberContactId || link?.memberContact?.id;
      if (mid) ids.add(mid);
    }
    return ids;
  }, [contactId, covered, linked]);

  // Debounced contact search (~300ms) for the "Link existing" flow — mirrors the
  // Assign dialog's pattern. Excludes people already in the family.
  useEffect(() => {
    if (addMode !== "link") return;
    const term = linkSearch.trim();
    if (!term) {
      setLinkResults([]);
      setLinkSearching(false);
      return;
    }
    setLinkSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await api.crm.list({ q: term, limit: 8 });
        const list = Array.isArray(res) ? res : (res as any)?.data || [];
        setLinkResults(list.filter((r: any) => !excludedIds.has(r.id)));
      } catch (err: any) {
        toast.error(err?.message || "Search failed");
        setLinkResults([]);
      } finally {
        setLinkSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [linkSearch, addMode, excludedIds]);

  // Load the service plans once. A family-package plan can't be a covered
  // service, so those are excluded from the picker.
  useEffect(() => {
    api.plans
      .list({ limit: 1000 })
      .then((res: any) => setPlans(Array.isArray(res) ? res : res?.data || []))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  const servicePlans = useMemo(
    () =>
      plans.filter(
        (p) => !(p as { isFamilyPlan?: boolean }).isFamilyPlan,
      ),
    [plans],
  );

  const planOptions = useMemo(
    () =>
      servicePlans.map((p) => ({
        value: p.id,
        label: `${p.name}${p.requiresAthlete ? " · Academy" : ""}${
          p.price != null ? ` — ${formatSAR(p.price)}` : ""
        }`,
      })),
    [servicePlans],
  );

  const selectedPlan = useMemo(
    () => servicePlans.find((p) => p.id === form.planId) || null,
    [servicePlans, form.planId],
  );
  const requiresAthlete = !!selectedPlan?.requiresAthlete;

  // Best display name for a covered membership row.
  const coveredLabel = (m: any) => {
    const a = m?.athlete;
    if (a) return `${a.firstName || ""} ${a.lastName || ""}`.trim() || "this member";
    const c = m?.crmContact;
    if (c) return `${c.firstName || ""} ${c.lastName || ""}`.trim() || "this member";
    return "this member";
  };

  const resetForm = () =>
    setForm({
      firstName: "", lastName: "", relation: "", planId: "", gender: "",
      dob: "", phone: "", email: "", nationality: "", idType: "NATIONAL_ID", idNumber: "", idExpiry: "",
    });

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("First and last name are required");
      return;
    }
    if (!form.gender) {
      toast.error("Please select a gender");
      return;
    }
    if (!form.planId) {
      toast.error("Pick a service for this member");
      return;
    }
    if (requiresAthlete && (!form.dob || !form.email.trim())) {
      toast.error("Date of birth and email are required for academy members");
      return;
    }
    const relationLabel =
      RELATION_OPTIONS.find((r) => r.value === form.relation)?.label || undefined;
    setAdding(true);
    try {
      if (requiresAthlete) {
        const a = await api.athletes.create({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          dob: new Date(form.dob).toISOString(),
          gender: form.gender,
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          nationality: form.nationality || undefined,
          idNumber: form.idNumber.trim() || undefined,
          idType: form.idNumber.trim() ? form.idType : undefined,
          idExpiry: form.idExpiry || null,
        });
        await api.memberships.assign({
          familyMembershipId: anchorMembershipId,
          athleteId: a.id,
          planId: form.planId,
          notes: relationLabel,
        });
      } else {
        const c = await api.crm.create({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          gender: form.gender,
          dob: form.dob ? new Date(form.dob).toISOString() : undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          nationalId: form.idNumber.trim() || undefined,
          idType: form.idNumber.trim() ? form.idType : undefined,
          idExpiry: form.idExpiry || null,
          type: "CUSTOMER",
        });
        await api.memberships.assign({
          familyMembershipId: anchorMembershipId,
          crmContactId: c.id,
          planId: form.planId,
          notes: relationLabel,
        });
      }
      toast.success("Member added to the family package");
      resetForm();
      await loadCovered();
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to add member");
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.memberships.delete(deleteTarget.id);
      toast.success("Member removed from the family package");
      setDeleteTarget(null);
      await loadCovered();
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove member");
    } finally {
      setDeleting(false);
    }
  };

  // Attach an existing contact to the family — they keep their own plan/billing.
  const linkMember = async (result: any) => {
    setLinkingId(result.id);
    try {
      await api.crm.addFamily(contactId, {
        memberContactId: result.id,
        relation: linkRelation || undefined,
      });
      toast.success("Linked to the family");
      setLinkSearch("");
      setLinkResults([]);
      await loadLinked();
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to link member");
    } finally {
      setLinkingId(null);
    }
  };

  const confirmUnlink = async () => {
    if (!unlinkTarget) return;
    setUnlinking(true);
    try {
      await api.crm.deleteFamily(unlinkTarget.id);
      toast.success("Member unlinked from the family");
      setUnlinkTarget(null);
      await loadLinked();
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to unlink member");
    } finally {
      setUnlinking(false);
    }
  };

  // Combined headcount across both kinds of family member.
  const totalCount = covered.length + linked.length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b p-6">
            <DialogTitle>Members covered by this package — {memberName}</DialogTitle>
            <DialogDescription>
              This family has {totalCount} member{totalCount === 1 ? "" : "s"}. Covered
              members get a free membership under this package; linked members keep their
              own plan &amp; billing.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {/* Covered members list — free under the package */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Covered by package · free ({covered.length})
              </p>
              {loading ? (
                <p className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </p>
              ) : covered.length === 0 ? (
                <p className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                  No covered members yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {covered.map((m) => {
                    const name = coveredLabel(m);
                    return (
                      <li
                        key={m.id}
                        className="flex items-center gap-3 rounded-md border px-3 py-2.5"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback>
                            {name.charAt(0).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate font-medium">{name}</span>
                            <Badge variant={statusVariant(m.status)}>
                              {m.status || "—"}
                            </Badge>
                            {m.athlete && <Badge variant="outline">Academy</Badge>}
                            {m.notes && <Badge variant="secondary">{m.notes}</Badge>}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.plan?.name || "—"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-sm"
                          onClick={() => setDeleteTarget(m)}
                          title="Remove"
                          aria-label="Remove covered member"
                        >
                          <Trash />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Linked members list — existing people who keep their own plan */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Linked · own plan ({linked.length})
              </p>
              {linkedLoading ? (
                <p className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </p>
              ) : linked.length === 0 ? (
                <p className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                  No linked members yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {linked.map((link) => {
                    const name = linkedLabel(link);
                    const c = link?.memberContact;
                    const sub = c?.email || c?.phone || "";
                    const relLabel =
                      RELATION_OPTIONS.find((r) => r.value === link.relation)?.label ||
                      (link.relation ? String(link.relation) : null);
                    return (
                      <li
                        key={link.id}
                        className="flex items-center gap-3 rounded-md border px-3 py-2.5"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback>
                            {name.charAt(0).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate font-medium">{name}</span>
                            {relLabel && <Badge variant="secondary">{relLabel}</Badge>}
                            <Badge variant="outline">Linked · own plan</Badge>
                          </div>
                          {sub && (
                            <p className="truncate text-xs text-muted-foreground">{sub}</p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-sm"
                          onClick={() => setUnlinkTarget(link)}
                          title="Unlink"
                          aria-label="Unlink member"
                        >
                          <Trash />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Add area — toggle between linking an existing person and creating
                a new covered member. */}
            <div className="space-y-4 border-t pt-5">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={addMode === "link" ? "default" : "outline"}
                  onClick={() => setAddMode("link")}
                >
                  Link existing
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={addMode === "new" ? "default" : "outline"}
                  onClick={() => setAddMode("new")}
                >
                  Add new
                </Button>
              </div>

              {addMode === "link" ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold">Link an existing member</p>
                    <p className="text-xs text-muted-foreground">
                      Attach a person who is already a contact. They keep their own plan
                      &amp; billing (or have no plan yet).
                    </p>
                  </div>

                  <Field label="Relation">
                    <SelectField
                      value={linkRelation}
                      onChange={setLinkRelation}
                      options={RELATION_OPTIONS}
                      placeholder="e.g. Child (optional)"
                    />
                  </Field>

                  <Field label="Find a member" htmlFor="fm-link-search">
                    <Input
                      id="fm-link-search"
                      value={linkSearch}
                      onChange={(e) => setLinkSearch(e.target.value)}
                      placeholder="Search by name, email or phone…"
                      autoComplete="off"
                    />
                    {linkSearch.trim() ? (
                      <div className="mt-2 max-h-56 overflow-y-auto rounded-md border">
                        {linkSearching ? (
                          <p className="px-3 py-2 text-sm text-muted-foreground">
                            Searching…
                          </p>
                        ) : linkResults.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-muted-foreground">
                            No matches.
                          </p>
                        ) : (
                          linkResults.map((r) => {
                            const rName =
                              `${r.firstName || ""} ${r.lastName || ""}`.trim() ||
                              "(unnamed)";
                            const rSub = r.email || r.phone || "";
                            const typeBadge = contactTypeBadge(
                              (String(r.type || "").toUpperCase() as Person["contactType"]) ||
                                null,
                            );
                            return (
                              <div
                                key={r.id}
                                className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-b-0"
                              >
                                <span className="flex min-w-0 flex-col items-start gap-0.5">
                                  <span className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium">
                                      {rName}
                                    </span>
                                    {typeBadge ? (
                                      <Badge variant={typeBadge.variant}>
                                        {typeBadge.label}
                                      </Badge>
                                    ) : null}
                                  </span>
                                  {rSub ? (
                                    <span className="truncate text-xs text-muted-foreground">
                                      {rSub}
                                    </span>
                                  ) : null}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={linkingId != null}
                                  onClick={() => linkMember(r)}
                                >
                                  <Plus />
                                  {linkingId === r.id ? "Linking…" : "Link"}
                                </Button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </Field>
                </div>
              ) : (
                <form onSubmit={addMember} className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold">Add a new member</p>
                    <p className="text-xs text-muted-foreground">
                      They get their own free, active membership under this package.
                      Academy members also get an athlete profile.
                    </p>
                  </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="First name *" htmlFor="fm-first">
                  <Input
                    id="fm-first"
                    required
                    value={form.firstName}
                    onChange={(e) => setField("firstName", e.target.value)}
                  />
                </Field>
                <Field label="Last name *" htmlFor="fm-last">
                  <Input
                    id="fm-last"
                    required
                    value={form.lastName}
                    onChange={(e) => setField("lastName", e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Relation">
                  <SelectField
                    value={form.relation}
                    onChange={(v) => setField("relation", v)}
                    options={RELATION_OPTIONS}
                    placeholder="e.g. Child"
                  />
                </Field>
                <Field label="Gender *">
                  <SelectField
                    value={form.gender}
                    onChange={(v) => setField("gender", v)}
                    options={GENDER_OPTIONS}
                    placeholder="Select gender…"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={requiresAthlete ? "Date of birth *" : "Date of birth"} htmlFor="fm-dob">
                  <Input
                    id="fm-dob"
                    type="date"
                    value={form.dob}
                    onChange={(e) => setField("dob", e.target.value)}
                  />
                </Field>
                <Field label="Phone" htmlFor="fm-phone">
                  <Input
                    id="fm-phone"
                    value={form.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                    placeholder="05XXXXXXXX"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={requiresAthlete ? "Email *" : "Email"} htmlFor="fm-email">
                  <Input
                    id="fm-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                  />
                </Field>
                <Field label="Nationality">
                  <ComboField
                    value={form.nationality}
                    onChange={(v) => setField("nationality", v)}
                    options={NATIONALITY_OPTIONS}
                    placeholder="Select…"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="ID type">
                  <SelectField
                    value={form.idType}
                    onChange={(v) => setField("idType", v)}
                    options={ID_TYPE_OPTIONS}
                  />
                </Field>
                <Field label="ID number" htmlFor="fm-idnum">
                  <Input
                    id="fm-idnum"
                    value={form.idNumber}
                    onChange={(e) => setField("idNumber", e.target.value)}
                    placeholder="e.g. 1234567890"
                  />
                </Field>
              </div>

              <Field label="ID expiry date (optional)" htmlFor="fm-idexpiry">
                <Input
                  id="fm-idexpiry"
                  type="date"
                  value={form.idExpiry}
                  onChange={(e) => setField("idExpiry", e.target.value)}
                />
              </Field>

              <Field label="Service *">
                <ComboField
                  value={form.planId}
                  onChange={(v) => setField("planId", v)}
                  options={planOptions}
                  placeholder={plansLoading ? "Loading services…" : "Select a service…"}
                />
                {selectedPlan && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {requiresAthlete
                      ? "Academy service — creates an athlete profile."
                      : "Leisure service."}{" "}
                    Covered free under this family package.
                  </p>
                )}
              </Field>

              <div className="flex justify-end">
                <Button type="submit" disabled={adding}>
                  <Plus />
                  {adding ? "Adding…" : "Add member"}
                </Button>
              </div>
                </form>
              )}
            </div>
          </div>

          <DialogFooter className="border-t p-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Remove covered member"
        description={`Remove ${deleteTarget ? coveredLabel(deleteTarget) : ""} from this family package? Their covered membership will be deleted.`}
        confirmLabel="Remove"
        variant="destructive"
        loading={deleting}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={!!unlinkTarget}
        onOpenChange={(o) => !o && setUnlinkTarget(null)}
        title="Unlink member"
        description={`Unlink ${unlinkTarget ? linkedLabel(unlinkTarget) : ""} from this family? Their own plan & billing are not affected.`}
        confirmLabel="Unlink"
        variant="destructive"
        loading={unlinking}
        onConfirm={confirmUnlink}
      />
    </Dialog>
  );
}

// ─── Assign Membership dialog ────────────────────────────────────────────────────

function AssignMembershipDialog({
  onClose,
  onCreated,
  initialContact,
}: {
  onClose: () => void;
  onCreated: () => void;
  initialContact?: {
    id: string;
    firstName: string;
    lastName: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    type?: string | null;
    sub?: string;
    linkedAthleteId?: string | null;
  } | null;
}) {
  // ONE common contact search — the chosen PLAN decides whether an athlete is
  // needed (academy plans), so there is no academy/leisure toggle here.
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  // Selected subject is always a CRM contact. linkedAthleteId is present on the
  // contact when it already has an academy athlete profile.
  const [subject, setSubject] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    type?: string | null;
    sub?: string;
    linkedAthleteId?: string | null;
  } | null>(initialContact ?? null);
  // Duplicate-assign guard — the subject's existing ACTIVE/PENDING memberships.
  // Multiple memberships are allowed, so this is a deliberate confirm, not a block.
  const [existingMemberships, setExistingMemberships] = useState<Membership[]>([]);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const [plans, setPlans] = useState<any[]>([]);
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState(toDateInput(new Date()));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [autoRenew, setAutoRenew] = useState(false);
  // Billing — every paid membership is invoiced; pay in full now, take a deposit
  // (partial payment, balance owed), issue an open invoice to pay later, send a
  // Tabby/Tamara BNPL pay-link, or record an external BNPL payment by reference.
  const [billingMode, setBillingMode] = useState<
    "now" | "deposit" | "later" | "tabby" | "tamara" | "manual"
  >("now");
  const [depositAmount, setDepositAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [bnplProvider, setBnplProvider] = useState<"tabby" | "tamara">("tabby");
  // Gateway availability — disables Tabby/Tamara when keys aren't configured.
  const [providers, setProviders] = useState<
    Array<{ provider: "tabby" | "tamara" | "stripe"; enabled: boolean }>
  >([]);
  // Pay-link returned by assign for tabby/tamara — shown with a Copy button.
  const [payLink, setPayLink] = useState<{ url: string; provider: string } | null>(null);
  // ID capture — writes back to the selected subject before assigning. Required
  // when the chosen member has no ID on file yet (see subjectHasId / needsId).
  const [idType, setIdType] = useState("NATIONAL_ID");
  const [idNumber, setIdNumber] = useState("");
  const [idExpiry, setIdExpiry] = useState("");
  const [idDocumentUrl, setIdDocumentUrl] = useState("");
  const [idUploading, setIdUploading] = useState(false);
  // null = not checked yet; false = member has NO ID on file (capture required).
  const [subjectHasId, setSubjectHasId] = useState<boolean | null>(null);
  // Athlete provisioning fields — only used for academy plans where the chosen
  // contact has no linked athlete yet.
  const [athleteDob, setAthleteDob] = useState("");
  const [athletePosition, setAthletePosition] = useState("MIDFIELDER");
  const [athleteJersey, setAthleteJersey] = useState("");
  const [athleteNationality, setAthleteNationality] = useState("");
  // Optional assigned PT trainer — picked from the COACH pool, sent as trainerId.
  const [trainerId, setTrainerId] = useState("");
  const [coaches, setCoaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load plans once (few of them — fine to fetch all).
  useEffect(() => {
    (async () => {
      try {
        const pRes = await api.plans.list({ limit: 1000 });
        setPlans(Array.isArray(pRes) ? pRes : (pRes as any)?.data || []);
      } catch (err: any) {
        toast.error(err?.message || "Failed to load plans");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load the coach pool once when the dialog opens — these are the PT trainers
  // selectable as the assigned trainer.
  useEffect(() => {
    api.users
      .list({ role: "COACH", limit: 100 })
      .then((res: any) => setCoaches(Array.isArray(res) ? res : res?.data || []))
      .catch(() => setCoaches([]));
  }, []);

  // Which BNPL gateways are configured — Tabby/Tamara options are disabled
  // (hint: add keys in Settings) when their provider is not enabled.
  useEffect(() => {
    api.payments
      .providers()
      .then((res) => setProviders(Array.isArray(res) ? res : []))
      .catch(() => setProviders([]));
  }, []);

  // When a subject is picked, look up their existing memberships so we can warn
  // before assigning a second active/pending one. Covers both the contact and
  // its linked athlete (academy memberships are tied to the athlete). Clears
  // whenever the subject changes (including back to none).
  useEffect(() => {
    setExistingMemberships([]);
    setConfirmDuplicate(false);
    setSubjectHasId(null);
    setIdExpiry("");
    if (!subject?.id) {
      setCheckingExisting(false);
      return;
    }
    let cancelled = false;
    setCheckingExisting(true);
    (async () => {
      try {
        const calls: Promise<any>[] = [
          api.memberships.list({ crmContactId: subject.id, limit: 50 }),
        ];
        if (subject.linkedAthleteId)
          calls.push(api.memberships.list({ athleteId: subject.linkedAthleteId, limit: 50 }));
        const resList = await Promise.all(calls);
        const list: Membership[] = resList.flatMap((r) =>
          Array.isArray(r) ? r : (r as any)?.data || [],
        );
        if (!cancelled) setExistingMemberships(list);
        // Does this member already have an ID on file? (contact, or linked athlete)
        const contact = (await api.crm.get(subject.id).catch(() => null)) as any;
        let hasId = !!(contact?.nationalId || contact?.idDocumentUrl);
        // Seed the expiry input from the loaded record so it can be edited in place.
        let expiry: string | null | undefined = contact?.idExpiry;
        if (!hasId && subject.linkedAthleteId) {
          const ath = (await api.athletes.get(subject.linkedAthleteId).catch(() => null)) as any;
          hasId = !!(ath?.idNumber || ath?.idDocumentUrl);
          if (ath?.idExpiry) expiry = ath.idExpiry;
        }
        if (!cancelled) {
          setSubjectHasId(hasId);
          if (expiry) setIdExpiry(toDateInputValue(expiry));
        }
      } catch {
        // Non-fatal — if the lookup fails we simply skip the warning.
        if (!cancelled) setExistingMemberships([]);
      } finally {
        if (!cancelled) setCheckingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject]);

  // Debounced server-side contact search (~300ms) — one search over all contacts.
  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await api.crm.list({ q: term, limit: 20 });
        const list = Array.isArray(res) ? res : (res as any)?.data || [];
        setResults(list);
      } catch (err: any) {
        toast.error(err?.message || "Search failed");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  // Auto-fill end date when plan changes if it has durationDays
  useEffect(() => {
    if (!planId || !startDate) return;
    const plan = plans.find((p) => p.id === planId);
    if (plan?.durationDays) {
      const start = new Date(startDate);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start);
        end.setDate(end.getDate() + Number(plan.durationDays));
        setEndDate(toDateInput(end));
      }
    }
  }, [planId, startDate, plans]);

  const subjectLabel = (r: any) => {
    const name = `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.name || "(unnamed)";
    const sub = r.email || r.phone || "";
    return { name, sub };
  };

  // The chosen plan drives athlete provisioning: academy plans (requiresAthlete)
  // must be tied to an athlete. Reuse the contact's linked athlete if it has one;
  // otherwise capture details to provision a new athlete profile.
  const selectedPlan = plans.find((p) => p.id === planId);
  const requiresAthlete = !!selectedPlan?.requiresAthlete;
  const linkedAthleteId = subject?.linkedAthleteId;
  const needsAthleteDetails = requiresAthlete && !linkedAthleteId;

  // Existing memberships that already grant (ACTIVE) or will grant (PENDING)
  // access — these drive the duplicate-assign confirm.
  const activeOrPending = existingMemberships.filter((m) =>
    ["ACTIVE", "PENDING"].includes(String(m.status || "").toUpperCase()),
  );
  const needsDuplicateConfirm = activeOrPending.length > 0;
  // Every member must have an ID on file — when the chosen member has none, force
  // ID capture (number + document) here before a plan can be assigned.
  const needsId = !!subject && subjectHasId === false;

  const uploadIdDoc = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large — keep it under 10 MB");
      return;
    }
    setIdUploading(true);
    try {
      const { url } = await uploadFile(file, {
        folder: "members/kyc",
        category: file.type.startsWith("image/")
          ? "image"
          : file.type === "application/pdf"
            ? "pdf"
            : "file",
      });
      setIdDocumentUrl(url);
      toast.success("ID document uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIdUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject?.id) {
      toast.error("Select a contact");
      return;
    }
    if (!planId) {
      toast.error("Plan is required");
      return;
    }
    // Academy plans need a complete athlete profile when the contact has none yet.
    if (needsAthleteDetails) {
      if (!athleteDob) {
        toast.error("Date of birth is required to create the athlete profile.");
        return;
      }
      if (!athleteJersey.trim()) {
        toast.error("Jersey number is required to create the athlete profile.");
        return;
      }
      if (!athletePosition) {
        toast.error("Pick a playing position for the athlete.");
        return;
      }
    }
    // ID is mandatory when the member has none on file yet.
    if (needsId && (!idNumber.trim() || !idDocumentUrl)) {
      toast.error(
        "This member has no ID on file — enter the ID number and upload the ID document to assign a plan.",
      );
      return;
    }
    // Multiple memberships are allowed, but assigning a second active/pending one
    // must be deliberate — require the confirm checkbox first.
    if (needsDuplicateConfirm && !confirmDuplicate) {
      toast.error(`${subject.name} already has an active/pending membership — tick the box to add another.`);
      return;
    }
    const price = Number(selectedPlan?.price) || 0;

    // Validate the deposit before any network call: must be > 0 and < the plan total.
    const depositNum = Number(depositAmount);
    if (price > 0 && billingMode === "deposit") {
      if (!Number.isFinite(depositNum) || depositNum <= 0 || depositNum >= price) {
        toast.error(`Deposit must be greater than 0 and less than ${formatSAR(price)}`);
        return;
      }
    }
    // BNPL pay-link modes need their gateway configured (keys in Settings).
    if (price > 0 && (billingMode === "tabby" || billingMode === "tamara")) {
      if (!providers.find((p) => p.provider === billingMode)?.enabled) {
        toast.error(`${billingMode === "tabby" ? "Tabby" : "Tamara"} is not configured — add keys in Settings.`);
        return;
      }
    }
    // Manual BNPL reference requires the reference text.
    if (price > 0 && billingMode === "manual" && !paymentReference.trim()) {
      toast.error("Enter the BNPL payment reference.");
      return;
    }

    setSaving(true);
    // Billing payload differs by mode:
    //  - paid (free or "now") → payNow:true records payment + activates
    //  - deposit              → depositAmount records a partial payment, membership stays PENDING
    //  - later                → neither, just raises the invoice
    //  - tabby / tamara       → paymentMethod only; backend returns a payLink
    //  - manual               → manual-reference + bnplProvider + paymentReference
    const billingFields: Record<string, unknown> =
      price <= 0
        ? { payNow: true, paymentMethod }
        : billingMode === "deposit"
          ? {
              payNow: false,
              depositAmount: depositNum,
              paymentMethod,
              paymentReference: paymentReference.trim() || undefined,
            }
          : billingMode === "tabby" || billingMode === "tamara"
            ? { paymentMethod: billingMode }
            : billingMode === "manual"
              ? {
                  paymentMethod: "manual-reference",
                  bnplProvider,
                  paymentReference: paymentReference.trim(),
                }
              : {
                  payNow: billingMode === "now",
                  paymentMethod,
                  paymentReference: paymentReference.trim() || undefined,
                };
    const isPayLinkMode = billingMode === "tabby" || billingMode === "tamara";
    const payLinkLabel = billingMode === "tamara" ? "Tamara" : "Tabby";
    try {
      let res: any;
      if (needsAthleteDetails) {
        // Academy plan + contact has no athlete: provision the athlete (creates a
        // user login + auto-links the CRM contact), then bill via athleteId.
        const athlete = await api.athletes.create({
          firstName: subject.firstName,
          lastName: subject.lastName,
          email: subject.email,
          phone: subject.phone,
          dob: new Date(athleteDob).toISOString(),
          position: athletePosition,
          jerseyNumber: Number(athleteJersey) || 0,
          nationality: athleteNationality.trim() || undefined,
          idType: idNumber.trim() ? idType : undefined,
          idNumber: idNumber.trim() || undefined,
          idExpiry: idExpiry || null,
          idDocumentUrl: idDocumentUrl || undefined,
        });
        res = await api.memberships.assign({
          athleteId: athlete.id,
          planId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes?.trim() || undefined,
          autoRenew: !!autoRenew,
          trainerId: trainerId || undefined,
          ...billingFields,
        });
        const memStatus = res?.membership?.status;
        if (isPayLinkMode) {
          /* pay-link toast handled below */
        } else if (price <= 0) toast.success("Athlete profile created — membership activated (free plan)");
        else if (billingMode === "manual")
          toast.success("Athlete profile created — BNPL reference recorded");
        else if (billingMode === "deposit")
          toast.success("Athlete profile created — deposit recorded, balance owed, membership pending");
        else if (memStatus === "ACTIVE")
          toast.success("Athlete profile created + membership active — they can log into the platform");
        else toast.success("Athlete profile created — invoice raised, membership pending until paid");
      } else if (requiresAthlete && linkedAthleteId) {
        // Academy plan, contact already has an athlete — bill via athleteId.
        if (idNumber.trim() || idDocumentUrl || idExpiry) {
          await api.athletes.update(linkedAthleteId, {
            ...(idNumber.trim() ? { idType, idNumber: idNumber.trim() } : {}),
            ...(idDocumentUrl ? { idDocumentUrl } : {}),
            ...(idExpiry ? { idExpiry } : {}),
          });
        }
        res = await api.memberships.assign({
          athleteId: linkedAthleteId,
          planId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes?.trim() || undefined,
          autoRenew: !!autoRenew,
          trainerId: trainerId || undefined,
          ...billingFields,
        });
        const memStatus = res?.membership?.status;
        if (isPayLinkMode) {
          /* pay-link toast handled below */
        } else if (price <= 0) toast.success("Free plan assigned — membership activated");
        else if (billingMode === "manual")
          toast.success("BNPL reference recorded — invoice raised against the membership");
        else if (billingMode === "deposit")
          toast.success("Deposit recorded — balance owed, membership pending until paid in full");
        else if (memStatus === "ACTIVE") toast.success("Payment recorded — membership activated");
        else toast.success("Invoice raised — membership pending until paid");
      } else {
        // Leisure plan (no athlete needed) — bill directly to the CRM contact.
        if (idNumber.trim() || idDocumentUrl || idExpiry) {
          await api.crm.update(subject.id, {
            ...(idNumber.trim() ? { idType, nationalId: idNumber.trim() } : {}),
            ...(idDocumentUrl ? { idDocumentUrl } : {}),
            ...(idExpiry ? { idExpiry } : {}),
          });
        }
        res = await api.memberships.assign({
          crmContactId: subject.id,
          planId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes?.trim() || undefined,
          autoRenew: !!autoRenew,
          trainerId: trainerId || undefined,
          ...billingFields,
        });
        const memStatus = res?.membership?.status;
        if (isPayLinkMode) {
          /* pay-link toast handled below */
        } else if (price <= 0) toast.success("Free plan assigned — membership activated");
        else if (billingMode === "manual")
          toast.success("BNPL reference recorded — invoice raised against the membership");
        else if (billingMode === "deposit")
          toast.success("Deposit recorded — balance owed, membership pending until paid in full");
        else if (memStatus === "ACTIVE") toast.success("Payment recorded — membership activated");
        else toast.success("Invoice raised — membership pending until paid");
      }
      // Pay-link modes: surface the returned link (Copy + emailed note) and keep
      // the dialog open so staff can copy it. Other modes close via onCreated().
      if (isPayLinkMode && res?.payLink?.url) {
        setPayLink({ url: res.payLink.url, provider: res.payLink.provider || billingMode });
        toast.success(`${payLinkLabel} pay-link created`);
      } else {
        onCreated();
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to assign membership");
    } finally {
      setSaving(false);
    }
  };

  const planOptions = plans.map((p) => ({
    value: p.id,
    label: `${p.name}${p.price != null ? ` — ${formatSAR(p.price)}` : ""}`,
  }));

  // Coach pool as combobox options, with a blank "none" entry at the top.
  const trainerOptions = [
    { value: "", label: "— none —" },
    ...coaches.map((c) => ({ value: c.id, label: c.name || c.email || "(unnamed)" })),
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b p-6">
            <DialogTitle>Assign Membership</DialogTitle>
            <DialogDescription>
              Search any contact and assign a plan — academy plans create or reuse an athlete automatically.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="p-10 text-center text-muted-foreground">Loading…</div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              {/* Searchable contact picker — one search over all contacts. The
                  chosen plan decides whether an athlete is created/used. */}
              <div className="sm:col-span-2">
              <Field label="Member / contact *" htmlFor="am-subject-search">
                {subject ? (
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{subject.name}</p>
                      {subject.sub ? (
                        <p className="truncate text-xs text-muted-foreground">{subject.sub}</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSubject(null);
                        setSearch("");
                        setResults([]);
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      id="am-subject-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search members by name, email or phone…"
                      autoComplete="off"
                    />
                    {search.trim() ? (
                      <div className="max-h-48 overflow-y-auto rounded-md border">
                        {searching ? (
                          <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
                        ) : results.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>
                        ) : (
                          results.map((r) => {
                            const { name, sub } = subjectLabel(r);
                            const typeBadge = contactTypeBadge(
                              (String(r.type || "").toUpperCase() as Person["contactType"]) || null,
                            );
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  setSubject({
                                    id: r.id,
                                    firstName: r.firstName || "",
                                    lastName: r.lastName || "",
                                    name,
                                    email: r.email ?? null,
                                    phone: r.phone ?? null,
                                    type: r.type ?? null,
                                    sub,
                                    linkedAthleteId: r.linkedAthleteId ?? null,
                                  });
                                  setResults([]);
                                }}
                                className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
                              >
                                <span className="flex min-w-0 flex-col items-start gap-0.5">
                                  <span className="truncate text-sm font-medium">{name}</span>
                                  {sub ? (
                                    <span className="truncate text-xs text-muted-foreground">{sub}</span>
                                  ) : null}
                                </span>
                                {typeBadge ? (
                                  <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
                                ) : null}
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Search any contact — pick a plan; academy plans will create/use an athlete automatically.
                    </p>
                  </div>
                )}
              </Field>
              </div>

              {/* Duplicate-assign warning — a person CAN hold multiple
                  memberships, so this is a deliberate confirm, not a hard block. */}
              {subject && needsDuplicateConfirm && (
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm sm:col-span-2">
                  <p className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                    <Warning className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong>{subject.name}</strong> already has an active/pending membership
                      {activeOrPending[0]?.plan?.name ? ` — ${activeOrPending[0].plan.name}` : ""}
                      {activeOrPending.length > 1 ? ` (+${activeOrPending.length - 1} more)` : ""}.
                      Assigning another will add to it.
                    </span>
                  </p>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="am-confirm-duplicate"
                      checked={confirmDuplicate}
                      onCheckedChange={(v) => setConfirmDuplicate(!!v)}
                    />
                    <Label htmlFor="am-confirm-duplicate">Add another membership anyway</Label>
                  </div>
                </div>
              )}
              {subject && checkingExisting && (
                <p className="text-xs text-muted-foreground sm:col-span-2">Checking existing memberships…</p>
              )}

              <div className="sm:col-span-2">
              <Field label="Plan *">
                <SelectField
                  value={planId}
                  onChange={setPlanId}
                  options={planOptions}
                  placeholder="Select plan…"
                />
              </Field>
              </div>

              {/* ID note spans full width; the four ID Fields below sit
                  directly in the outer grid as their own cells. */}
              <div className="space-y-3 sm:col-span-2">
                {needsId ? (
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    This member has no ID on file — an ID number <strong>and</strong> ID
                    document are required to assign a plan.
                  </p>
                ) : subjectHasId === true ? (
                  <p className="text-xs text-muted-foreground">
                    ✓ ID already on file — update below only if needed (optional).
                  </p>
                ) : null}
              </div>
              <Field label="ID type">
                <SelectField
                  value={idType}
                  onChange={setIdType}
                  options={ID_TYPE_OPTIONS}
                />
              </Field>
              <Field label={needsId ? "ID number *" : "ID number"} htmlFor="am-idnum">
                <Input
                  id="am-idnum"
                  className="font-mono"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="e.g. 1234567890"
                />
              </Field>
              <Field label="ID expiry date (optional)" htmlFor="am-idexpiry">
                <Input
                  id="am-idexpiry"
                  type="date"
                  value={idExpiry}
                  onChange={(e) => setIdExpiry(e.target.value)}
                />
              </Field>
              <Field
                label={needsId ? "ID document (image or PDF) *" : "ID document (image or PDF)"}
              >
                <KycUploadInput
                  busy={idUploading}
                  url={idDocumentUrl}
                  onSelect={(file) => uploadIdDoc(file)}
                  onClear={() => setIdDocumentUrl("")}
                />
              </Field>

              <Field label="Start date" htmlFor="am-start">
                <Input
                  id="am-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="End date" htmlFor="am-end">
                <Input
                  id="am-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>

              <Field label="Assigned trainer (PT)">
                <ComboField
                  value={trainerId}
                  onChange={setTrainerId}
                  options={trainerOptions}
                  placeholder="Select trainer…"
                />
              </Field>

              <div className="flex items-center gap-3">
                <Switch id="am-autorenew" checked={autoRenew} onCheckedChange={(v) => setAutoRenew(!!v)} />
                <Label htmlFor="am-autorenew">Auto-renew at end date</Label>
              </div>

              <div className="sm:col-span-2">
              <Field label="Notes" htmlFor="am-notes">
                <Textarea
                  id="am-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes (optional)"
                />
              </Field>
              </div>

              {/* Billing — every membership is billed; no free passes. */}
              <div className="sm:col-span-2">
              {planId
                ? (() => {
                    const sp = plans.find((p) => p.id === planId);
                    const price = Number(sp?.price) || 0;
                    if (price <= 0) {
                      return (
                        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                          Free plan — no payment required. The membership activates immediately.
                        </div>
                      );
                    }
                    const tabbyEnabled = providers.find((p) => p.provider === "tabby")?.enabled ?? false;
                    const tamaraEnabled = providers.find((p) => p.provider === "tamara")?.enabled ?? false;
                    const bnplDisabled: Record<string, boolean> = { tabby: !tabbyEnabled, tamara: !tamaraEnabled };
                    return (
                      <div className="space-y-3 rounded-md border p-3">
                        <span className="text-sm font-medium">Billing — {formatSAR(price)}</span>
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              { v: "now", label: "Pay in full now" },
                              { v: "deposit", label: "Take a deposit" },
                              { v: "later", label: "Invoice — pay later" },
                              { v: "tabby", label: "Tabby (pay-link)" },
                              { v: "tamara", label: "Tamara (pay-link)" },
                              { v: "manual", label: "Manual BNPL reference" },
                            ] as const
                          ).map((m) => {
                            const disabled = bnplDisabled[m.v] === true;
                            return (
                              <button
                                key={m.v}
                                type="button"
                                disabled={disabled}
                                title={disabled ? "Add keys in Settings" : undefined}
                                onClick={() => setBillingMode(m.v)}
                                className={`rounded-md border px-3 py-2 text-sm ${billingMode === m.v ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"} disabled:cursor-not-allowed disabled:opacity-50`}
                              >
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                        {(billingMode === "tabby" || billingMode === "tamara") &&
                          bnplDisabled[billingMode] && (
                            <p className="text-xs text-muted-foreground">Add keys in Settings.</p>
                          )}
                        {billingMode === "deposit" && (
                          <Field label="Deposit amount (SAR)" htmlFor="assign-deposit">
                            <Input
                              id="assign-deposit"
                              type="number"
                              min={0}
                              max={price}
                              step="0.01"
                              value={depositAmount}
                              onChange={(e) => setDepositAmount(e.target.value)}
                              placeholder={`0 – ${formatSAR(price)}`}
                            />
                            <div className="mt-2 flex gap-2">
                              {[0.25, 0.5, 0.75].map((pct) => (
                                <Button
                                  key={pct}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setDepositAmount(String(Math.round(price * pct * 100) / 100))
                                  }
                                >
                                  {pct * 100}%
                                </Button>
                              ))}
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              The deposit is recorded as a partial payment. The balance stays owed and
                              the member remains <strong>pending</strong> until paid in full.
                            </p>
                          </Field>
                        )}
                        {billingMode === "now" || billingMode === "deposit" ? (
                          <>
                            <Field label="Payment method">
                              <SelectField
                                value={paymentMethod}
                                onChange={setPaymentMethod}
                                options={[
                                  { value: "cash", label: "Cash" },
                                  { value: "card", label: "Card" },
                                  { value: "bank-transfer", label: "Bank transfer" },
                                  { value: "cheque", label: "Cheque" },
                                ]}
                              />
                            </Field>
                            <Field label="Reference / Transaction ID" htmlFor="assign-payment-ref">
                              <Input
                                id="assign-payment-ref"
                                value={paymentReference}
                                onChange={(e) => setPaymentReference(e.target.value)}
                                placeholder="Transaction ID, cheque no., bank ref…"
                              />
                            </Field>
                          </>
                        ) : billingMode === "tabby" || billingMode === "tamara" ? (
                          payLink ? (
                            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                              <p className="text-xs font-medium text-foreground">
                                {payLink.provider === "tamara" ? "Tamara" : "Tabby"} pay-link
                              </p>
                              <div className="flex items-center gap-2">
                                <Input readOnly value={payLink.url} className="text-xs" />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    navigator.clipboard
                                      ?.writeText(payLink.url)
                                      .then(() => toast.success("Pay-link copied"))
                                      .catch(() => toast.error("Could not copy"));
                                  }}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Pay-link emailed to {subject?.email || "the customer"}.
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              A {billingMode === "tamara" ? "Tamara" : "Tabby"} pay-link will be created
                              and emailed to {subject?.email || "the customer"}. The membership stays{" "}
                              <strong>pending</strong> until they complete payment.
                            </p>
                          )
                        ) : billingMode === "manual" ? (
                          <>
                            <Field label="BNPL provider">
                              <SelectField
                                value={bnplProvider}
                                onChange={(v) => setBnplProvider(v === "tamara" ? "tamara" : "tabby")}
                                options={[
                                  { value: "tabby", label: "Tabby" },
                                  { value: "tamara", label: "Tamara" },
                                ]}
                              />
                            </Field>
                            <Field label="Reference / Transaction ID" htmlFor="assign-bnpl-ref">
                              <Input
                                id="assign-bnpl-ref"
                                value={paymentReference}
                                onChange={(e) => setPaymentReference(e.target.value)}
                                placeholder="BNPL order / payment reference…"
                              />
                            </Field>
                            <p className="text-xs text-muted-foreground">
                              Records a payment already taken through{" "}
                              {bnplProvider === "tamara" ? "Tamara" : "Tabby"} outside the system, by reference.
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            An invoice will be issued. The member stays <strong>pending</strong> (no access) until it&rsquo;s paid.
                          </p>
                        )}
                      </div>
                    );
                  })()
                : null}
              </div>

              {/* Athlete details — academy plans require an athlete. When the
                  chosen contact has no linked athlete yet, capture details to
                  provision one (with an app login) and tie the membership to it. */}
              {needsAthleteDetails && (
                <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm sm:col-span-2">
                  <div>
                    <p className="font-medium text-foreground">Athlete details</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This academy plan needs an athlete profile. We&apos;ll create one (with an app
                      login) and tie the membership to it — all in one click.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Date of birth *" htmlFor="am-athlete-dob">
                      <Input
                        id="am-athlete-dob"
                        type="date"
                        value={athleteDob}
                        onChange={(e) => setAthleteDob(e.target.value)}
                      />
                    </Field>
                    <Field label="Jersey number *" htmlFor="am-athlete-jersey">
                      <Input
                        id="am-athlete-jersey"
                        type="number"
                        min={0}
                        value={athleteJersey}
                        onChange={(e) => setAthleteJersey(e.target.value)}
                        placeholder="e.g. 10"
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Position">
                      <SelectField
                        value={athletePosition}
                        onChange={setAthletePosition}
                        options={POSITION_OPTIONS}
                      />
                    </Field>
                    <Field label="Nationality">
                      <ComboField
                        value={athleteNationality}
                        onChange={setAthleteNationality}
                        options={NATIONALITY_OPTIONS}
                        placeholder="Select nationality…"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {requiresAthlete && linkedAthleteId && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Academy plan — this membership will be tied to the contact&apos;s existing athlete
                  profile.
                </p>
              )}
              </div>
            </div>
          )}

          <DialogFooter className="border-t p-4">
            {payLink ? (
              <Button type="button" onClick={() => onCreated()}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving || loading || (needsDuplicateConfirm && !confirmDuplicate)}
                >
                  {saving ? "Saving…" : "Assign"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
