"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { useAuth } from "@/components/providers/auth-provider";
import { PermissionGate } from "@/components/shared/permission-gate";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Bell,
  Check,
  Clock,
  Phone,
  Mail,
  Calendar,
  Chat,
  Edit,
  Trash,
  Plus,
  Send,
  ArrowRight,
  Warning,
} from "@/lib/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

type FollowUpType = "call" | "email" | "meeting" | "sms" | "note";

interface FollowUpContact {
  id: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  type?: string | null;
  stage?: string | null;
}

interface FollowUp {
  id: string;
  contactId: string;
  dueAt: string;
  type: FollowUpType | string;
  subject: string;
  notes?: string | null;
  assignedTo?: string | null;
  completed: boolean;
  completedAt?: string | null;
  contact?: FollowUpContact | null;
}

interface RepOption {
  id: string;
  name: string;
  email?: string | null;
}

interface ContactOption {
  id: string;
  label: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const FILTERS = [
  { value: "today", label: "Today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Upcoming (7d)" },
  { value: "open", label: "All open" },
  { value: "done", label: "Completed" },
] as const;

type FilterKey = (typeof FILTERS)[number]["value"];

const TYPE_OPTIONS: { value: FollowUpType; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "sms", label: "SMS" },
  { value: "note", label: "Note" },
];

const TYPE_ICON: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  note: Chat,
  sms: Chat,
};

// "Unassigned" sentinel for the rep <Select> (base-ui Select wants non-empty values).
const ANY = "__any__";
const UNASSIGNED = "__unassigned__";

// ─── Date helpers ───────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
/** YYYY-MM-DDTHH:mm in local time, for <input type="datetime-local">. */
function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function formatDayHeading(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function contactName(c?: FollowUpContact | null): string {
  if (!c) return "Unknown contact";
  return `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email || "Contact";
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function FollowUpsPage() {
  const { user } = useAuth();
  const isSales = (user?.role || "").toLowerCase() === "sales";

  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterKey>("today");
  // Sales reps only ever see their own; everyone else can scope by rep.
  const [repFilter, setRepFilter] = useState<string>(ANY);

  const [reps, setReps] = useState<RepOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const [deleting, setDeleting] = useState<FollowUp | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [digesting, setDigesting] = useState(false);

  const repName = useCallback(
    (id?: string | null) => (id ? reps.find((r) => r.id === id)?.name || "Assigned" : null),
    [reps],
  );

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const buildParams = useCallback(
    (f: FilterKey): Record<string, string> => {
      const now = new Date();
      let p: Record<string, string> = {};
      if (f === "today") {
        p = { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString(), completed: "false" };
      } else if (f === "overdue") {
        p = { overdue: "true" };
      } else if (f === "upcoming") {
        const weekOut = new Date(now);
        weekOut.setDate(weekOut.getDate() + 7);
        p = { from: now.toISOString(), to: endOfDay(weekOut).toISOString(), completed: "false" };
      } else if (f === "done") {
        p = { completed: "true" };
      } else {
        p = { completed: "false" };
      }
      // Sales reps are implicitly scoped server-side by their own assignment if
      // backend supports it, but we also pass assignedTo for the explicit filter.
      if (!isSales && repFilter !== ANY) {
        p.assignedTo = repFilter === UNASSIGNED ? "" : repFilter;
      }
      if (isSales && user?.id) p.assignedTo = user.id;
      return p;
    },
    [isSales, repFilter, user?.id],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.crm.listFollowUps(buildParams(filter));
      const list: FollowUp[] = Array.isArray(res) ? res : res?.data ?? [];
      setItems(list);
    } catch (e) {
      const msg = errMsg(e, "Failed to load follow-ups");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [buildParams, filter]);

  useEffect(() => {
    load();
  }, [load]);

  // Reps + contacts for the dialogs / filters — loaded once.
  useEffect(() => {
    if (isSales) return; // reps can't reassign; skip the user list
    api.users
      .list({ limit: 200 })
      .then((res) => {
        const rows = Array.isArray(res) ? res : res?.data ?? [];
        setReps(rows.map((u: any) => ({ id: u.id, name: u.name || u.email, email: u.email })));
      })
      .catch(() => undefined);
  }, [isSales]);

  useEffect(() => {
    api.crm
      .list({ limit: 200, sort: "recent" })
      .then((res) => {
        const rows = Array.isArray(res) ? res : res?.data ?? [];
        setContacts(
          rows.map((c: any) => ({
            id: c.id,
            label: `${`${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email || "Contact"}${c.email ? ` · ${c.email}` : ""}`,
          })),
        );
      })
      .catch(() => undefined);
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const now = new Date();
    const ts = startOfDay(now);
    const te = endOfDay(now);
    let today = 0;
    let overdue = 0;
    let done = 0;
    for (const f of items) {
      const due = new Date(f.dueAt);
      if (f.completed) done++;
      else if (due < ts) overdue++;
      else if (due >= ts && due <= te) today++;
    }
    return { today, overdue, done };
  }, [items]);

  const grouped = useMemo(() => {
    const map: Record<string, FollowUp[]> = {};
    for (const f of items) {
      const key = String(f.dueAt).slice(0, 10);
      (map[key] ||= []).push(f);
    }
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({
        date,
        list: list.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()),
      }));
  }, [items]);

  // ── Actions ────────────────────────────────────────────────────────────────────

  const toggleComplete = async (f: FollowUp) => {
    try {
      await api.crm.updateFollowUp(f.id, { completed: !f.completed });
      toast.success(f.completed ? "Marked as not done" : "Follow-up completed");
      load();
    } catch (e) {
      toast.error(errMsg(e, "Could not update follow-up"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await api.crm.deleteFollowUp(deleting.id);
      toast.success("Follow-up deleted");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Could not delete follow-up"));
    } finally {
      setDeletingBusy(false);
    }
  };

  const runDigest = async () => {
    setDigesting(true);
    try {
      const res = await api.crm.runFollowUpDigest();
      const sent = res?.notificationsSent ?? 0;
      const processed = res?.processed ?? 0;
      toast.success(
        sent > 0
          ? `Digest sent — ${sent} reminder${sent === 1 ? "" : "s"} out of ${processed} due`
          : `Digest run — no new reminders (${processed} already notified)`,
      );
    } catch (e) {
      toast.error(errMsg(e, "Could not run the reminder digest"));
    } finally {
      setDigesting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <PermissionGate
      permission="followups:view"
      fallback={
        <EmptyState
          icon={<Bell className="h-6 w-6 text-muted-foreground" />}
          title="No access to follow-ups"
          description="You don't have permission to view the sales follow-up calendar."
        />
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Follow-ups"
          description="Internal sales calendar — schedule calls, emails and meetings with reminders when they're due."
          actions={
            <>
              <Button variant="outline" onClick={runDigest} disabled={digesting}>
                <Send /> {digesting ? "Running…" : "Run digest"}
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> New follow-up
              </Button>
            </>
          }
        />

        {/* Stat row */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Due today" value={counts.today} hue="yellow" icon={<Calendar className="h-5 w-5" />} />
          <StatCard label="Overdue" value={counts.overdue} hue="rose" icon={<Warning className="h-5 w-5" />} />
          <StatCard label="Completed (in view)" value={counts.done} hue="emerald" icon={<Check className="h-5 w-5" />} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            const badge =
              f.value === "today" && counts.today > 0
                ? counts.today
                : f.value === "overdue" && counts.overdue > 0
                  ? counts.overdue
                  : null;
            return (
              <Button
                key={f.value}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
                {badge !== null && (
                  <Badge
                    variant={active ? "secondary" : f.value === "overdue" ? "destructive" : "secondary"}
                    className="ml-1"
                  >
                    {badge}
                  </Badge>
                )}
              </Button>
            );
          })}

          {!isSales && (
            <div className="ml-auto w-full sm:w-56">
              <Select value={repFilter} onValueChange={(v) => setRepFilter((v as string) ?? ANY)}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="All reps" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All reps</SelectItem>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {reps.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<Warning className="h-6 w-6 text-destructive" />}
            title="Couldn't load follow-ups"
            description={error}
            action={{ label: "Retry", onClick: () => load() }}
          />
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-6 w-6 text-muted-foreground" />}
            title="No follow-ups for this filter"
            description="Schedule a call, email or meeting to keep your pipeline moving."
            action={{ label: "New follow-up", onClick: () => setCreateOpen(true) }}
          />
        ) : (
          <div className="space-y-6">
            {grouped.map((day) => {
              const isToday = day.date === new Date().toISOString().slice(0, 10);
              const isOverdue =
                new Date(`${day.date}T00:00:00`) < startOfDay(new Date()) &&
                !day.list.every((f) => f.completed);
              return (
                <div key={day.date} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{formatDayHeading(day.date)}</h2>
                    {isToday && <Badge variant="secondary">Today</Badge>}
                    {isOverdue && <Badge variant="destructive">Overdue</Badge>}
                  </div>
                  <div className="space-y-2">
                    {day.list.map((f) => (
                      <FollowUpRow
                        key={f.id}
                        followUp={f}
                        repName={repName(f.assignedTo)}
                        onToggle={() => toggleComplete(f)}
                        onEdit={() => setEditing(f)}
                        onDelete={() => setDeleting(f)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create */}
      <FollowUpDialog
        key={createOpen ? "create-open" : "create-closed"}
        open={createOpen}
        mode="create"
        reps={reps}
        contacts={contacts}
        canAssign={!isSales}
        onOpenChange={setCreateOpen}
        onSaved={() => {
          setCreateOpen(false);
          load();
        }}
      />

      {/* Edit */}
      <FollowUpDialog
        key={editing ? `edit-${editing.id}` : "edit-closed"}
        open={!!editing}
        mode="edit"
        followUp={editing ?? undefined}
        reps={reps}
        contacts={contacts}
        canAssign={!isSales}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />

      {/* Delete */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete follow-up?"
        description={
          deleting
            ? `"${deleting.subject}" will be permanently removed. This can't be undone.`
            : ""
        }
        variant="destructive"
        confirmLabel="Delete"
        loading={deletingBusy}
        onConfirm={confirmDelete}
      />
    </PermissionGate>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────────

function FollowUpRow({
  followUp,
  repName,
  onToggle,
  onEdit,
  onDelete,
}: {
  followUp: FollowUp;
  repName: string | null;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = TYPE_ICON[String(followUp.type)] ?? Chat;
  const overdue = !followUp.completed && new Date(followUp.dueAt) < new Date();

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
        followUp.completed
          ? "opacity-60"
          : overdue
            ? "border-destructive/40 bg-destructive/[0.03]"
            : "hover:border-primary/40"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        title={followUp.completed ? "Mark as not done" : "Mark complete"}
        aria-pressed={followUp.completed}
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          followUp.completed
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-input hover:border-emerald-500 hover:text-emerald-500"
        }`}
      >
        {followUp.completed && <Check className="size-3.5" />}
      </button>

      <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={`text-sm font-medium ${followUp.completed ? "text-muted-foreground line-through" : ""}`}>
            {followUp.subject}
          </p>
          <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <Clock className="size-3" />
            {formatTime(followUp.dueAt)}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {followUp.contact && (
            <Link
              href={`/crm/${followUp.contact.id}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {contactName(followUp.contact)}
              <ArrowRight className="size-3" />
            </Link>
          )}
          <Badge variant="outline" className="capitalize">
            {String(followUp.type)}
          </Badge>
          {repName && <Badge variant="ghost">{repName}</Badge>}
        </div>

        {followUp.notes && (
          <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">{followUp.notes}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit">
          <Edit />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} title="Delete">
          <Trash />
        </Button>
      </div>
    </div>
  );
}

// ─── Create / Edit dialog ───────────────────────────────────────────────────────

function FollowUpDialog({
  open,
  mode,
  followUp,
  reps,
  contacts,
  canAssign,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  followUp?: FollowUp;
  reps: RepOption[];
  contacts: ContactOption[];
  canAssign: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const initialDue = followUp?.dueAt ? new Date(followUp.dueAt) : roundedSoon();

  const [contactId, setContactId] = useState<string>(followUp?.contactId || "");
  const [type, setType] = useState<FollowUpType>((followUp?.type as FollowUpType) || "call");
  const [subject, setSubject] = useState(followUp?.subject || "");
  const [dueLocal, setDueLocal] = useState(toLocalInput(initialDue));
  const [notes, setNotes] = useState(followUp?.notes || "");
  const [assignedTo, setAssignedTo] = useState<string>(followUp?.assignedTo || UNASSIGNED);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (mode === "create" && !contactId) {
      toast.error("Pick a contact for this follow-up");
      return;
    }
    if (!dueLocal) {
      toast.error("A due date is required");
      return;
    }

    const payload: Record<string, unknown> = {
      type,
      subject: subject.trim(),
      notes: notes.trim() || null,
      dueAt: new Date(dueLocal).toISOString(),
    };
    if (canAssign) payload.assignedTo = assignedTo === UNASSIGNED ? null : assignedTo;

    setSaving(true);
    try {
      if (mode === "create") {
        await api.crm.createFollowUp(contactId, payload);
        toast.success("Follow-up scheduled");
      } else if (followUp) {
        await api.crm.updateFollowUp(followUp.id, payload);
        toast.success("Follow-up updated");
      }
      onSaved();
    } catch (e2) {
      toast.error(errMsg(e2, "Could not save the follow-up"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New follow-up" : "Edit follow-up"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Schedule a call, email or meeting. The assigned rep gets a reminder when it's due."
              : "Update the details of this follow-up."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {mode === "create" && (
            <div className="space-y-1.5">
              <Label htmlFor="fu-contact">Contact</Label>
              <Select value={contactId || undefined} onValueChange={(v) => setContactId((v as string) || "")}>
                <SelectTrigger id="fu-contact" className="w-full">
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {contacts.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      No contacts found
                    </SelectItem>
                  ) : (
                    contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fu-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType((v as FollowUpType) || "call")}>
                <SelectTrigger id="fu-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fu-due">Due</Label>
              <Input
                id="fu-due"
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fu-subject">Subject</Label>
            <Input
              id="fu-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Call to confirm trial session"
              required
            />
          </div>

          {canAssign && (
            <div className="space-y-1.5">
              <Label htmlFor="fu-assignee">Assigned to</Label>
              <Select value={assignedTo} onValueChange={(v) => setAssignedTo((v as string) || UNASSIGNED)}>
                <SelectTrigger id="fu-assignee" className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {reps.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="fu-notes">Notes</Label>
            <Textarea
              id="fu-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context for this follow-up…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : mode === "create" ? "Schedule" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Default due time: next top-of-hour, today. */
function roundedSoon(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}
