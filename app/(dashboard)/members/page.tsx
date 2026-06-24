"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api, uploadFile } from "@/lib/api";
import { cn } from "@/lib/utils";
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "ACADEMY" | "LEISURE">("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null>(null);

  const [showAssign, setShowAssign] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [familyMembership, setFamilyMembership] = useState<Membership | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Membership | null>(null);
  const [freezeTarget, setFreezeTarget] = useState<Membership | null>(null);
  const [unfreezeTarget, setUnfreezeTarget] = useState<Membership | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // §3 — server-side search. The search term is debounced and passed to
  // api.memberships.list({ search }), which matches name / phone / ID across
  // the linked athlete, user AND crmContact.
  const load = useCallback(async (search = "", pageArg = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { page: pageArg, limit: PAGE_SIZE };
      const term = search.trim();
      if (term) params.search = term;
      const result = await api.memberships.list(params);
      const rows = Array.isArray(result) ? result : result?.data || [];
      setMemberships(rows);
      setMeta(Array.isArray(result) ? null : result?.meta ?? null);
    } catch (err: any) {
      setError(err?.message || "Failed to load memberships");
      toast.error(err?.message || "Failed to load memberships");
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, []);

  // Debounce the search term (~300ms) and re-query the server when it (or the
  // page) changes.
  useEffect(() => {
    const t = setTimeout(() => load(query, page), 300);
    return () => clearTimeout(t);
  }, [query, page, load]);

  // Re-query keeping the current search term + page so the list doesn't reset
  // after create / edit / freeze actions.
  const reload = useCallback(() => load(query, page), [load, query, page]);

  // Status + side (academy/leisure) filtering stays client-side on the
  // server-searched result set.
  const filtered = useMemo(() => {
    return memberships.filter((m) => {
      const s = String(m.status || "").toUpperCase();
      if (statusFilter !== "ALL" && s !== statusFilter) return false;
      if (typeFilter === "ACADEMY" && !m.athleteId) return false;
      if (typeFilter === "LEISURE" && m.athleteId) return false;
      return true;
    });
  }, [memberships, statusFilter, typeFilter]);

  const memberLabel = (m: Membership) => displayName(m) || "this membership";

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

  const counts = useMemo(
    () => ({
      all: memberships.length,
      academy: memberships.filter((m) => m.athleteId).length,
      leisure: memberships.filter((m) => !m.athleteId).length,
    }),
    [memberships],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Active, pending and expired memberships across both academy and leisure. Add a new member (academy athlete or leisure customer) and assign a plan."
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

      {/* Type filter (academy vs leisure) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Side</span>
        {(
          [
            { v: "ALL", label: "All", count: counts.all },
            { v: "ACADEMY", label: "Academy", count: counts.academy },
            { v: "LEISURE", label: "Leisure", count: counts.leisure },
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
            <span className="opacity-70">· {t.count}</span>
          </Button>
        ))}
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

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  Loading members…
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-destructive">{error}</p>
                    <Button variant="outline" size="sm" onClick={reload}>
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UsersMultiple className="h-8 w-8 opacity-40" />
                    <p>
                      {query.trim()
                        ? "No members match your search."
                        : "No memberships match your filters."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => {
                const name = displayName(m);
                const email = m.athlete?.email || m.crmContact?.email || m.user?.email || "";
                const phone = m.athlete?.phone || m.crmContact?.phone || m.user?.phone || "";
                const idNumber = m.athlete?.idNumber || m.crmContact?.nationalId || "";
                const crmId = contactIdOf(m);
                const isFrozen = String(m.status || "").toUpperCase() === "FROZEN";
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{(name.charAt(0) || "?").toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{name || "—"}</p>
                          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
                        <p className="truncate">{phone || "—"}</p>
                        {idNumber && <p className="truncate font-mono">ID {idNumber}</p>}
                      </div>
                    </TableCell>
                    <TableCell>{m.plan?.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(m.status)}>{m.status || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(m.startDate)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(m.endDate)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSAR(m.price ?? m.plan?.price)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {crmId && (
                          <Button
                            variant="outline"
                            size="icon-sm"
                            render={<Link href={`/crm/${crmId}`} />}
                            title="Open in CRM"
                            aria-label="Open in CRM"
                          >
                            <Share2 />
                          </Button>
                        )}
                        {isFrozen ? (
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
                        {crmId && (
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => setFamilyMembership(m)}
                            title="Family members"
                            aria-label="Family members"
                          >
                            <UsersIcon />
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
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={meta?.total ?? filtered.length}
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

      {familyMembership && contactIdOf(familyMembership) && (
        <FamilyMembersDialog
          contactId={contactIdOf(familyMembership) as string}
          membershipId={familyMembership.id}
          memberName={displayName(familyMembership) || familyMembership.plan?.name || "this member"}
          onClose={() => setFamilyMembership(null)}
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
                  <Field label="Nationality" htmlFor="nm-nat">
                    <Input
                      id="nm-nat"
                      value={form.nationality}
                      onChange={(e) => set("nationality", e.target.value)}
                      placeholder="e.g. Saudi"
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
                  <Field label="Nationality" htmlFor="nm-nat-l">
                    <Input
                      id="nm-nat-l"
                      value={form.nationality}
                      onChange={(e) => set("nationality", e.target.value)}
                      placeholder="e.g. Saudi"
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
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FAMILY });
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    setSaving(true);
    try {
      await api.crm.addFamily(contactId, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        dob: form.dob ? new Date(form.dob).toISOString() : undefined,
        gender: form.gender,
        relation: form.relation,
        idType: form.idNumber.trim() ? form.idType : undefined,
        idNumber: form.idNumber.trim() || undefined,
        school: form.school.trim() || undefined,
        notes: form.notes.trim() || undefined,
        // §8 — link the dependent to this single membership when added from a
        // membership context.
        membershipId: membershipId || undefined,
      });
      toast.success("Family member added");
      setForm({ ...EMPTY_FAMILY });
      await loadFamily();
    } catch (err: any) {
      // Backend rejects dependents under age 5 — surface that (and any other) error.
      toast.error(err?.message || "Failed to add family member");
    } finally {
      setSaving(false);
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

  const familyLabel = (fm: any) =>
    `${fm.firstName || ""} ${fm.lastName || ""}`.trim() || "this family member";

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
                  {family.map((fm) => (
                    <li key={fm.id} className="flex items-center gap-3 rounded-md border px-3 py-2.5">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback>{(fm.firstName || "?").charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{familyLabel(fm)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[fm.relation, fm.dob ? formatDate(fm.dob) : null, fm.school || null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
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
                  ))}
                </ul>
              )}
            </div>

            {/* Add form */}
            <form onSubmit={submit} className="space-y-4 border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Add family member
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Field label="First name *" htmlFor="fm-first">
                  <Input
                    id="fm-first"
                    required
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                  />
                </Field>
                <Field label="Last name" htmlFor="fm-last">
                  <Input
                    id="fm-last"
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date of birth" htmlFor="fm-dob">
                  <Input
                    id="fm-dob"
                    type="date"
                    value={form.dob}
                    onChange={(e) => set("dob", e.target.value)}
                  />
                </Field>
                <Field label="Gender">
                  <SelectField
                    value={form.gender}
                    onChange={(v) => set("gender", v)}
                    options={GENDER_OPTIONS}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Relation">
                  <SelectField
                    value={form.relation}
                    onChange={(v) => set("relation", v)}
                    options={FAMILY_RELATIONS.map((r) => ({
                      value: r,
                      label: r.charAt(0) + r.slice(1).toLowerCase(),
                    }))}
                  />
                </Field>
                <Field label="School" htmlFor="fm-school">
                  <Input
                    id="fm-school"
                    value={form.school}
                    onChange={(e) => set("school", e.target.value)}
                    placeholder="e.g. Riyadh Intl."
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="ID type">
                  <SelectField
                    value={form.idType}
                    onChange={(v) => set("idType", v)}
                    options={FAMILY_ID_TYPES.map((t) => ({
                      value: t,
                      label: t
                        .split("_")
                        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
                        .join(" "),
                    }))}
                  />
                </Field>
                <Field label="ID number" htmlFor="fm-idnum">
                  <Input
                    id="fm-idnum"
                    className="font-mono"
                    value={form.idNumber}
                    onChange={(e) => set("idNumber", e.target.value)}
                    placeholder="e.g. 1234567890"
                  />
                </Field>
              </div>

              <Field label="Notes" htmlFor="fm-notes">
                <Textarea
                  id="fm-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Anything staff should know"
                />
              </Field>

              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  <Plus />
                  {saving ? "Adding…" : "Add family member"}
                </Button>
              </div>
            </form>
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
  // Which side are we assigning to?
  const [subjectType, setSubjectType] = useState<"ACADEMY" | "LEISURE">("ACADEMY");

  // Searchable subject picker state
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  // Selected subject (athlete or crm contact); { id, name, sub } where sub = email/phone
  const [subject, setSubject] = useState<{ id: string; name: string; sub?: string } | null>(null);

  const [plans, setPlans] = useState<any[]>([]);
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState(toDateInput(new Date()));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [autoRenew, setAutoRenew] = useState(false);
  // Billing — every paid membership is invoiced; collect now or issue an open invoice.
  const [payNow, setPayNow] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  // Optional ID capture — writes back to the selected subject before assigning.
  const [idType, setIdType] = useState("NATIONAL_ID");
  const [idNumber, setIdNumber] = useState("");
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

  // Reset the picker whenever the subject type toggles.
  useEffect(() => {
    setSubject(null);
    setSearch("");
    setResults([]);
  }, [subjectType]);

  // Debounced server-side search (~300ms) for the active subject type.
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
        let list: any[] = [];
        if (subjectType === "ACADEMY") {
          const res = await api.athletes.list({ search: term, limit: 20 });
          list = Array.isArray(res) ? res : (res as any)?.data || [];
        } else {
          const res = await api.crm.list({ q: term, limit: 20 });
          list = Array.isArray(res) ? res : (res as any)?.data || [];
        }
        setResults(list);
      } catch (err: any) {
        toast.error(err?.message || "Search failed");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [search, subjectType]);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject?.id) {
      toast.error(
        subjectType === "ACADEMY"
          ? "Select an academy athlete"
          : "Select a leisure member",
      );
      return;
    }
    if (!planId) {
      toast.error("Plan is required");
      return;
    }
    const selectedPlan = plans.find((p) => p.id === planId);
    const price = Number(selectedPlan?.price) || 0;
    setSaving(true);
    try {
      // Capture the ID onto the subject first (skip when left blank so we never
      // wipe an existing value).
      if (idNumber.trim()) {
        if (subjectType === "ACADEMY") {
          await api.athletes.update(subject.id, { idType, idNumber: idNumber.trim() });
        } else {
          await api.crm.update(subject.id, { idType, nationalId: idNumber.trim() });
        }
      }
      // Route through billing: creates a PENDING membership + an invoice, and
      // (payNow) records the payment which activates it. Free plans auto-activate.
      const res = await api.memberships.assign({
        ...(subjectType === "ACADEMY"
          ? { athleteId: subject.id }
          : { crmContactId: subject.id }),
        planId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        notes: notes?.trim() || undefined,
        autoRenew: !!autoRenew,
        payNow: price > 0 ? payNow : true,
        paymentMethod,
      });
      const memStatus = res?.membership?.status;
      if (price <= 0) toast.success("Free plan assigned — membership activated");
      else if (memStatus === "ACTIVE") toast.success("Payment recorded — membership activated");
      else toast.success("Invoice raised — membership pending until paid");
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b p-6">
            <DialogTitle>Assign Membership</DialogTitle>
            <DialogDescription>
              Assign a plan to an academy athlete or a leisure member.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="p-10 text-center text-muted-foreground">Loading…</div>
          ) : (
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {/* Subject type toggle */}
              <Field label="Assign to *">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: "ACADEMY", label: "Academy (athlete)" },
                      { v: "LEISURE", label: "Leisure (member)" },
                    ] as const
                  ).map((t) => (
                    <Button
                      key={t.v}
                      type="button"
                      size="sm"
                      variant={subjectType === t.v ? "default" : "outline"}
                      onClick={() => setSubjectType(t.v)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
              </Field>

              {/* Searchable subject picker */}
              <Field
                label={subjectType === "ACADEMY" ? "Athlete *" : "Member / contact *"}
                htmlFor="am-subject-search"
              >
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
                      placeholder={
                        subjectType === "ACADEMY"
                          ? "Search athletes by name or email…"
                          : "Search members by name, email or phone…"
                      }
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
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  setSubject({ id: r.id, name, sub });
                                  setResults([]);
                                }}
                                className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
                              >
                                <span className="text-sm font-medium">{name}</span>
                                {sub ? (
                                  <span className="text-xs text-muted-foreground">{sub}</span>
                                ) : null}
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </Field>

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
          )}

          <DialogFooter className="border-t p-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || loading}>
              {saving ? "Saving…" : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
