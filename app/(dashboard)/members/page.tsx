"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api, uploadFile } from "@/lib/api";
import { cn } from "@/lib/utils";
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

const FAMILY_RELATIONS = ["CHILD", "SPOUSE", "PARENT", "SIBLING", "GUARDIAN", "OTHER"];
const FAMILY_ID_TYPES = ["NATIONAL_ID", "IQAMA", "PASSPORT"];

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const router = useRouter();
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
  const [showAddMember, setShowAddMember] = useState(false);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [familyMembership, setFamilyMembership] = useState<Membership | null>(null);
  const [familyContactId, setFamilyContactId] = useState<string | null>(null);
  const [familyBusy, setFamilyBusy] = useState<string | null>(null);
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
    setFamilyContactId(cid);
    setFamilyMembership(membership);
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
            <Button variant="outline" onClick={() => setShowAddMember(true)}>
              <Plus />
              New Member
            </Button>
            <Button onClick={() => setShowAssign(true)}>
              <Plus />
              Assign Membership
            </Button>
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
                const isOpen = expanded.has(p.key);
                const typeBadge = contactTypeBadge(p.contactType);
                const primaryFrozen =
                  String(primary?.status || "").toUpperCase() === "FROZEN";
                return (
                  <Fragment key={p.key}>
                    <TableRow>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {multi ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(p.key)}
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={isOpen ? "Collapse memberships" : "Expand memberships"}
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
                            <div className="flex items-center gap-2">
                              <p className="truncate font-medium">{p.name || "—"}</p>
                              {typeBadge && (
                                <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
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
                          {p.idNumber && <p className="truncate font-mono">ID {p.idNumber}</p>}
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
                          {(p.contactId || p.athleteId) && primary && !p.isDependent && (
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
                              {primaryFrozen ? (
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
                              )}
                              <Button
                                variant="outline"
                                size="icon-sm"
                                onClick={() => setEditing(primary)}
                                title="Edit"
                                aria-label="Edit membership"
                              >
                                <SquarePen />
                              </Button>
                              <Button
                                variant="destructive"
                                size="icon-sm"
                                onClick={() => setDeleteTarget(primary)}
                                title="Delete"
                                aria-label="Delete membership"
                              >
                                <Trash />
                              </Button>
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
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatSAR(m.price ?? m.plan?.price)}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                {subFrozen ? (
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
                                )}
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  onClick={() => setEditing(m)}
                                  title="Edit"
                                  aria-label="Edit membership"
                                >
                                  <SquarePen />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="icon-sm"
                                  onClick={() => setDeleteTarget(m)}
                                  title="Delete"
                                  aria-label="Delete membership"
                                >
                                  <Trash />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
          onClose={() => setShowAssign(false)}
          onCreated={() => {
            setShowAssign(false);
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

      {familyMembership && familyContactId && (
        <FamilyMembersDialog
          contactId={familyContactId}
          membershipId={familyMembership.id}
          memberName={displayName(familyMembership) || familyMembership.plan?.name || "this member"}
          onClose={() => {
            setFamilyMembership(null);
            setFamilyContactId(null);
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
  payNow: boolean;
  paymentMethod: string;
  paymentReference: string;
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
  payNow: true,
  paymentMethod: "cash",
  paymentReference: "",
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

    setSaving(true);
    const planPrice = Number(plans.find((p) => p.id === form.planId)?.price) || 0;
    const billingToast = (status: string | undefined, label: string) =>
      planPrice <= 0
        ? `${label} — activated (free plan)`
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
          payNow: planPrice > 0 ? form.payNow : true,
          paymentMethod: form.paymentMethod,
          paymentReference: form.paymentReference.trim() || undefined,
        });
        toast.success(billingToast(res?.membership?.status, "Academy member created"));
        onCreated({ type: "ACADEMY", email: form.email.trim() });
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
        });
        // Bill for the plan: PENDING membership + invoice; payNow records payment & activates.
        const res = await api.memberships.assign({
          crmContactId: contact.id,
          planId: form.planId,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          payNow: planPrice > 0 ? form.payNow : true,
          paymentMethod: form.paymentMethod,
          paymentReference: form.paymentReference.trim() || undefined,
        });
        toast.success(billingToast(res?.membership?.status, "Leisure member created"));
        onCreated({ type: "LEISURE", email: form.email.trim() });
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
                    return (
                      <div className="space-y-3 rounded-md border p-3">
                        <span className="text-sm font-medium">Billing — {formatSAR(price)}</span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => set("payNow", true)}
                            className={`rounded-md border px-3 py-2 text-sm ${form.payNow ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"}`}
                          >
                            Collect payment now
                          </button>
                          <button
                            type="button"
                            onClick={() => set("payNow", false)}
                            className={`rounded-md border px-3 py-2 text-sm ${!form.payNow ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"}`}
                          >
                            Invoice — pay later
                          </button>
                        </div>
                        {form.payNow ? (
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
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create Member"}
            </Button>
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
  memberName,
  onClose,
}: {
  contactId: string;
  membershipId: string;
  memberName: string;
  onClose: () => void;
}) {
  const [family, setFamily] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Add flow — two modes: link an existing CRM contact, or create one & link it.
  const [mode, setMode] = useState<"LINK" | "CREATE">("LINK");

  // Link-existing mode
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [linkRelation, setLinkRelation] = useState(FAMILY_RELATIONS[0]);
  const [linking, setLinking] = useState(false);

  // Create-&-link mode
  const [createForm, setCreateForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    dob: "",
    relation: FAMILY_RELATIONS[0],
  });
  const [creating, setCreating] = useState(false);
  const setCreate = <K extends keyof typeof createForm>(k: K, v: (typeof createForm)[K]) =>
    setCreateForm((f) => ({ ...f, [k]: v }));

  const relationOptions = FAMILY_RELATIONS.map((r) => ({
    value: r,
    label: r.charAt(0) + r.slice(1).toLowerCase(),
  }));

  const loadFamily = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.crm.listFamily(contactId);
      setFamily(Array.isArray(res) ? res : res?.data || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load family members");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    loadFamily();
  }, [loadFamily]);

  // IDs already linked (or the primary contact) — excluded from search results so
  // we never offer to link the same person twice.
  const excludedIds = useMemo(() => {
    const ids = new Set<string>([contactId]);
    for (const fm of family) {
      if (fm?.memberContactId) ids.add(fm.memberContactId);
    }
    return ids;
  }, [family, contactId]);

  // Debounced server-side contact search (~300ms).
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
        const res = await api.crm.list({ q: term, limit: 8 });
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

  const resetLink = () => {
    setSelected(null);
    setSearch("");
    setResults([]);
    setLinkRelation(FAMILY_RELATIONS[0]);
  };

  const linkExisting = async () => {
    if (!selected?.id) return;
    setLinking(true);
    try {
      await api.crm.addFamily(contactId, {
        memberContactId: selected.id,
        relation: linkRelation,
        membershipId,
      });
      toast.success("Family member linked");
      resetLink();
      await loadFamily();
    } catch (err: any) {
      toast.error(err?.message || "Failed to link family member");
    } finally {
      setLinking(false);
    }
  };

  const createAndLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    setCreating(true);
    try {
      const c = await api.crm.create({
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        dob: createForm.dob ? new Date(createForm.dob).toISOString() : undefined,
        type: "CUSTOMER",
        source: "family",
      });
      await api.crm.addFamily(contactId, {
        memberContactId: c.id,
        relation: createForm.relation,
        membershipId,
      });
      toast.success("Family member created & linked");
      setCreateForm({ firstName: "", lastName: "", phone: "", dob: "", relation: FAMILY_RELATIONS[0] });
      await loadFamily();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create family member");
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.crm.deleteFamily(deleteTarget.id);
      toast.success("Family member removed");
      setDeleteTarget(null);
      await loadFamily();
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove family member");
    } finally {
      setDeleting(false);
    }
  };

  // Display name for a row — prefer the linked contact, fall back to the legacy blob.
  const familyLabel = (fm: any) => {
    const c = fm?.memberContact;
    const name = c
      ? `${c.firstName || ""} ${c.lastName || ""}`.trim()
      : `${fm.firstName || ""} ${fm.lastName || ""}`.trim();
    return name || "this family member";
  };

  const relationLabel = (r?: string) =>
    r ? r.charAt(0) + r.slice(1).toLowerCase() : null;

  const contactLabel = (c: any) => {
    const name = `${c.firstName || ""} ${c.lastName || ""}`.trim() || "(unnamed)";
    const sub = c.email || c.phone || "";
    return { name, sub };
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b p-6">
            <DialogTitle>Family members — {memberName}</DialogTitle>
            <DialogDescription>Dependents and family linked to this member.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {/* Existing family list */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Current ({family.length})
              </p>
              {loading ? (
                <p className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </p>
              ) : family.length === 0 ? (
                <p className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                  No family members yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {family.map((fm) => {
                    const c = fm.memberContact;
                    return (
                      <li
                        key={fm.id}
                        className="flex items-center gap-3 rounded-md border px-3 py-2.5"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback>
                            {familyLabel(fm).charAt(0).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          {c ? (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <Link
                                href={`/crm/${c.id}`}
                                className="truncate font-medium hover:underline"
                              >
                                {familyLabel(fm)}
                              </Link>
                              {relationLabel(fm.relation) && (
                                <Badge variant="secondary">{relationLabel(fm.relation)}</Badge>
                              )}
                              {c.type && <Badge variant="outline">{c.type}</Badge>}
                              {c.linkedAthleteId && <Badge variant="outline">Athlete</Badge>}
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="truncate font-medium">{familyLabel(fm)}</span>
                              {relationLabel(fm.relation) && (
                                <Badge variant="secondary">{relationLabel(fm.relation)}</Badge>
                              )}
                            </div>
                          )}
                          <p className="truncate text-xs text-muted-foreground">
                            {c
                              ? c.email || c.phone || "—"
                              : "Info only — not a linked contact"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-sm"
                          onClick={() => setDeleteTarget(fm)}
                          title="Remove"
                          aria-label="Remove family member"
                        >
                          <Trash />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Add section — link an existing contact or create one & link it */}
            <div className="space-y-4 border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Add family member
              </p>

              {/* Mode toggle */}
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { v: "LINK", label: "Link existing" },
                    { v: "CREATE", label: "Create new & link" },
                  ] as const
                ).map((t) => (
                  <Button
                    key={t.v}
                    type="button"
                    size="sm"
                    variant={mode === t.v ? "default" : "outline"}
                    onClick={() => setMode(t.v)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>

              {mode === "LINK" ? (
                <div className="space-y-3">
                  <Field label="Find a contact" htmlFor="fm-search">
                    {selected ? (
                      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {contactLabel(selected).name}
                          </p>
                          {contactLabel(selected).sub ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {contactLabel(selected).sub}
                            </p>
                          ) : null}
                        </div>
                        <Button type="button" size="sm" variant="ghost" onClick={resetLink}>
                          Change
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          id="fm-search"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search by name, email or phone…"
                          autoComplete="off"
                        />
                        {search.trim() ? (
                          <div className="max-h-48 overflow-y-auto rounded-md border">
                            {searching ? (
                              <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
                            ) : (
                              (() => {
                                const visible = results.filter((r) => !excludedIds.has(r.id));
                                if (visible.length === 0) {
                                  return (
                                    <p className="px-3 py-2 text-sm text-muted-foreground">
                                      No matches.
                                    </p>
                                  );
                                }
                                return visible.map((r) => {
                                  const { name, sub } = contactLabel(r);
                                  return (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={() => {
                                        setSelected(r);
                                        setResults([]);
                                      }}
                                      className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
                                    >
                                      <span className="flex min-w-0 flex-col">
                                        <span className="truncate text-sm font-medium">{name}</span>
                                        {sub ? (
                                          <span className="truncate text-xs text-muted-foreground">
                                            {sub}
                                          </span>
                                        ) : null}
                                      </span>
                                      {r.type ? (
                                        <Badge variant="outline" className="shrink-0">
                                          {r.type}
                                        </Badge>
                                      ) : null}
                                    </button>
                                  );
                                });
                              })()
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </Field>

                  {selected && (
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <Field label="Relation">
                          <SelectField
                            value={linkRelation}
                            onChange={setLinkRelation}
                            options={relationOptions}
                          />
                        </Field>
                      </div>
                      <Button type="button" onClick={linkExisting} disabled={linking}>
                        <Plus />
                        {linking ? "Linking…" : "Link"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={createAndLink} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name *" htmlFor="fm-new-first">
                      <Input
                        id="fm-new-first"
                        required
                        value={createForm.firstName}
                        onChange={(e) => setCreate("firstName", e.target.value)}
                      />
                    </Field>
                    <Field label="Last name" htmlFor="fm-new-last">
                      <Input
                        id="fm-new-last"
                        value={createForm.lastName}
                        onChange={(e) => setCreate("lastName", e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Phone" htmlFor="fm-new-phone">
                      <Input
                        id="fm-new-phone"
                        value={createForm.phone}
                        onChange={(e) => setCreate("phone", e.target.value)}
                        placeholder="e.g. 05XXXXXXXX"
                      />
                    </Field>
                    <Field label="Date of birth" htmlFor="fm-new-dob">
                      <Input
                        id="fm-new-dob"
                        type="date"
                        value={createForm.dob}
                        onChange={(e) => setCreate("dob", e.target.value)}
                      />
                    </Field>
                  </div>

                  <Field label="Relation">
                    <SelectField
                      value={createForm.relation}
                      onChange={(v) => setCreate("relation", v)}
                      options={relationOptions}
                    />
                  </Field>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={creating}>
                      <Plus />
                      {creating ? "Saving…" : "Create & link"}
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
        title="Remove family member"
        description={`Remove ${deleteTarget ? familyLabel(deleteTarget) : ""}?`}
        confirmLabel="Remove"
        variant="destructive"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </Dialog>
  );
}

// ─── Assign Membership dialog ────────────────────────────────────────────────────

function AssignMembershipDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
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
  } | null>(null);
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
  // Billing — every paid membership is invoiced; collect now or issue an open invoice.
  const [payNow, setPayNow] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  // Optional ID capture — writes back to the selected subject before assigning.
  const [idType, setIdType] = useState("NATIONAL_ID");
  const [idNumber, setIdNumber] = useState("");
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

  // When a subject is picked, look up their existing memberships so we can warn
  // before assigning a second active/pending one. Covers both the contact and
  // its linked athlete (academy memberships are tied to the athlete). Clears
  // whenever the subject changes (including back to none).
  useEffect(() => {
    setExistingMemberships([]);
    setConfirmDuplicate(false);
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
    // Multiple memberships are allowed, but assigning a second active/pending one
    // must be deliberate — require the confirm checkbox first.
    if (needsDuplicateConfirm && !confirmDuplicate) {
      toast.error(`${subject.name} already has an active/pending membership — tick the box to add another.`);
      return;
    }
    const price = Number(selectedPlan?.price) || 0;
    setSaving(true);
    try {
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
        });
        const res = await api.memberships.assign({
          athleteId: athlete.id,
          planId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes?.trim() || undefined,
          autoRenew: !!autoRenew,
          trainerId: trainerId || undefined,
          payNow: price > 0 ? payNow : true,
          paymentMethod,
          paymentReference: paymentReference.trim() || undefined,
        });
        const memStatus = res?.membership?.status;
        if (price <= 0) toast.success("Athlete profile created — membership activated (free plan)");
        else if (memStatus === "ACTIVE")
          toast.success("Athlete profile created + membership active — they can log into the platform");
        else toast.success("Athlete profile created — invoice raised, membership pending until paid");
      } else if (requiresAthlete && linkedAthleteId) {
        // Academy plan, contact already has an athlete — bill via athleteId.
        if (idNumber.trim()) {
          await api.athletes.update(linkedAthleteId, { idType, idNumber: idNumber.trim() });
        }
        const res = await api.memberships.assign({
          athleteId: linkedAthleteId,
          planId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes?.trim() || undefined,
          autoRenew: !!autoRenew,
          trainerId: trainerId || undefined,
          payNow: price > 0 ? payNow : true,
          paymentMethod,
          paymentReference: paymentReference.trim() || undefined,
        });
        const memStatus = res?.membership?.status;
        if (price <= 0) toast.success("Free plan assigned — membership activated");
        else if (memStatus === "ACTIVE") toast.success("Payment recorded — membership activated");
        else toast.success("Invoice raised — membership pending until paid");
      } else {
        // Leisure plan (no athlete needed) — bill directly to the CRM contact.
        if (idNumber.trim()) {
          await api.crm.update(subject.id, { idType, nationalId: idNumber.trim() });
        }
        const res = await api.memberships.assign({
          crmContactId: subject.id,
          planId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes?.trim() || undefined,
          autoRenew: !!autoRenew,
          trainerId: trainerId || undefined,
          payNow: price > 0 ? payNow : true,
          paymentMethod,
          paymentReference: paymentReference.trim() || undefined,
        });
        const memStatus = res?.membership?.status;
        if (price <= 0) toast.success("Free plan assigned — membership activated");
        else if (memStatus === "ACTIVE") toast.success("Payment recorded — membership activated");
        else toast.success("Invoice raised — membership pending until paid");
      }
      onCreated();
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
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
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
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {/* Searchable contact picker — one search over all contacts. The
                  chosen plan decides whether an athlete is created/used. */}
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

              {/* Duplicate-assign warning — a person CAN hold multiple
                  memberships, so this is a deliberate confirm, not a hard block. */}
              {subject && needsDuplicateConfirm && (
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
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
                <p className="text-xs text-muted-foreground">Checking existing memberships…</p>
              )}

              <Field label="Plan *">
                <SelectField
                  value={planId}
                  onChange={setPlanId}
                  options={planOptions}
                  placeholder="Select plan…"
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="ID type">
                  <SelectField
                    value={idType}
                    onChange={setIdType}
                    options={ID_TYPE_OPTIONS}
                  />
                </Field>
                <Field label="ID number" htmlFor="am-idnum">
                  <Input
                    id="am-idnum"
                    className="font-mono"
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    placeholder="e.g. 1234567890"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <Field label="Notes" htmlFor="am-notes">
                <Textarea
                  id="am-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes (optional)"
                />
              </Field>

              <div className="flex items-center gap-3">
                <Switch id="am-autorenew" checked={autoRenew} onCheckedChange={(v) => setAutoRenew(!!v)} />
                <Label htmlFor="am-autorenew">Auto-renew at end date</Label>
              </div>

              <Field label="Assigned trainer (PT)">
                <ComboField
                  value={trainerId}
                  onChange={setTrainerId}
                  options={trainerOptions}
                  placeholder="Select trainer…"
                />
              </Field>

              {/* Billing — every membership is billed; no free passes. */}
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
                    return (
                      <div className="space-y-3 rounded-md border p-3">
                        <span className="text-sm font-medium">Billing — {formatSAR(price)}</span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPayNow(true)}
                            className={`rounded-md border px-3 py-2 text-sm ${payNow ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"}`}
                          >
                            Collect payment now
                          </button>
                          <button
                            type="button"
                            onClick={() => setPayNow(false)}
                            className={`rounded-md border px-3 py-2 text-sm ${!payNow ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"}`}
                          >
                            Invoice — pay later
                          </button>
                        </div>
                        {payNow ? (
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
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            An invoice will be issued. The member stays <strong>pending</strong> (no access) until it&rsquo;s paid.
                          </p>
                        )}
                      </div>
                    );
                  })()
                : null}

              {/* Athlete details — academy plans require an athlete. When the
                  chosen contact has no linked athlete yet, capture details to
                  provision one (with an app login) and tie the membership to it. */}
              {needsAthleteDetails && (
                <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
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
                <p className="text-xs text-muted-foreground">
                  Academy plan — this membership will be tied to the contact&apos;s existing athlete
                  profile.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="border-t p-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || loading || (needsDuplicateConfirm && !confirmDuplicate)}
            >
              {saving ? "Saving…" : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
