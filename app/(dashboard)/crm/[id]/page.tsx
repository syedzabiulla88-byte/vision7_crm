"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PermissionGate } from "@/components/shared/permission-gate";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { NATIONALITY_OPTIONS } from "@/lib/nationalities";
import { idExpiryStatus, toDateInputValue } from "@/lib/id-expiry";
import {
  ArrowLeft,
  Send,
  Edit,
  Trash,
  Check,
  Close,
  Plus,
  Mail,
  Phone,
  MapPin,
  Tag,
  Clock,
  Calendar,
  FileText,
  Bell,
  User,
  Users as UsersIcon,
  Briefcase,
  ArrowRight,
  ChevronDown,
  Chat,
  UserAdd,
  Award,
  Copy,
} from "@/lib/icons";

// ─── Option lists (ported from site/src/app/admin/crm/[id]/page.js) ─────────────

const TYPES = [
  { value: "LEAD", label: "Lead" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "MEMBER", label: "Member" },
  { value: "FORMER", label: "Former" },
];
const STAGES = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];
const GENDERS = [
  { value: "", label: "—" },
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];
const ID_TYPES = [
  { value: "", label: "—" },
  { value: "NATIONAL_ID", label: "National ID" },
  { value: "IQAMA", label: "Iqama" },
  { value: "PASSPORT", label: "Passport" },
];
const MARITAL_STATUSES = [
  { value: "", label: "—" },
  { value: "SINGLE", label: "Single" },
  { value: "MARRIED", label: "Married" },
  { value: "DIVORCED", label: "Divorced" },
  { value: "WIDOWED", label: "Widowed" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];
const WORK_STATUSES = [
  { value: "", label: "—" },
  { value: "EMPLOYED", label: "Employed" },
  { value: "SELF_EMPLOYED", label: "Self-employed" },
  { value: "UNEMPLOYED", label: "Unemployed" },
  { value: "STUDENT", label: "Student" },
  { value: "RETIRED", label: "Retired" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];
const PREFERRED_LANGUAGES = [
  { value: "", label: "—" },
  { value: "ARABIC", label: "Arabic" },
  { value: "ENGLISH", label: "English" },
];
const CLIENT_GOALS = [
  { value: "", label: "—" },
  { value: "WEIGHT_LOSS", label: "Weight Loss" },
  { value: "MUSCLE_BUILDING", label: "Muscle Building" },
  { value: "IMPROVE_FITNESS", label: "Improve Fitness Level" },
  { value: "BETTER_SOCIAL_LIFE", label: "Better Social Life" },
  { value: "POST_INJURY_REHAB", label: "Post-Injury Rehabilitation" },
  { value: "IMPROVE_FLEXIBILITY", label: "Improve Flexibility" },
  { value: "EVENT_PREPARATION", label: "Event/Competition Preparation" },
  { value: "STRESS_RELIEF", label: "Stress Relief / Mental Wellbeing" },
];
const PLAN_TYPES = [
  { value: "ACADEMY", label: "Academy" },
  { value: "LEISURE", label: "Leisure" },
  { value: "PERSONAL_TRAINING", label: "Personal Training" },
];
const ATHLETE_POSITIONS = [
  { value: "GOALKEEPER", label: "Goalkeeper" },
  { value: "DEFENDER", label: "Defender" },
  { value: "MIDFIELDER", label: "Midfielder" },
  { value: "FORWARD", label: "Forward" },
];
const ACTIVITY_TYPES = [
  { value: "NOTE", label: "Note" },
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Meeting" },
  { value: "SMS", label: "SMS" },
];
const FOLLOWUP_TYPES = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "sms", label: "SMS" },
  { value: "note", label: "Note" },
];

type Option = { value: string; label: string };

// Email quick templates (ported from SendEmailModal.js)
const EMAIL_TEMPLATES = [
  {
    id: "welcome",
    label: "Welcome",
    subject: "Welcome to Vision7",
    body:
      "Thanks for connecting with us — we're glad to have you.\n\n" +
      "If there's anything specific you'd like to explore (training, facilities, memberships, private hire), just reply to this email and we'll point you in the right direction.\n\n" +
      "Looking forward to meeting you on site.",
  },
  {
    id: "booking-confirmation",
    label: "Booking confirmation",
    subject: "Your Vision7 booking is confirmed",
    body:
      "Great news — your booking is confirmed.\n\n" +
      "Please arrive 10 minutes before your slot. If you need to reschedule or cancel, reply to this email as soon as possible.\n\n" +
      "See you on site.",
  },
  {
    id: "follow-up",
    label: "Follow-up",
    subject: "Checking in from Vision7",
    body:
      "Just a quick note to follow up on our recent chat.\n\n" +
      "Let me know if you'd like to book a visit, arrange a trial session, or have any questions we can help with.",
  },
  {
    id: "invoice-reminder",
    label: "Invoice reminder",
    subject: "Friendly invoice reminder — Vision7",
    body:
      "Just a gentle reminder that an outstanding invoice is on your account.\n\n" +
      "Please settle it at your earliest convenience. If you've already paid, please ignore this email — and thank you.\n\n" +
      "Reply here if you need help with payment methods or have any questions.",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function labelFor(options: Option[], value?: string | null): string | null {
  if (value === null || value === undefined || value === "") return null;
  const m = options.find((o) => o.value === value);
  return m ? m.label : String(value);
}

function toDateInput(v?: string | null): string {
  if (!v) return "";
  return String(v).slice(0, 10);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSAR(amount?: number | string | null): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = Number(amount);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(n);
}

function ageFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function initials(first?: string, last?: string): string {
  return `${(first?.[0] || "?")}${last?.[0] || ""}`.toUpperCase();
}

function typeBadgeClass(t?: string): string {
  switch (String(t || "").toUpperCase()) {
    case "LEAD":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
    case "CUSTOMER":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
    case "MEMBER":
      return "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400";
    case "FORMER":
      return "bg-gray-500/10 text-gray-600 border-gray-500/30 dark:text-gray-400";
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

function stageBadgeClass(s?: string): string {
  switch (String(s || "").toUpperCase()) {
    case "NEW":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
    case "CONTACTED":
      return "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400";
    case "QUALIFIED":
      return "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-400";
    case "PROPOSAL":
      return "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400";
    case "WON":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
    case "LOST":
      return "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400";
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

function statusBadgeClass(s?: string): string {
  switch (String(s || "").toUpperCase()) {
    case "CONFIRMED":
    case "ACTIVE":
    case "PAID":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
    case "PENDING":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
    case "COMPLETED":
    case "SENT":
    case "FROZEN":
      return "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400";
    case "PARTIAL":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
    case "CANCELLED":
    case "SUSPENDED":
    case "DRAFT":
      return "bg-gray-500/10 text-gray-600 border-gray-500/30 dark:text-gray-400";
    case "OVERDUE":
    case "EXPIRED":
      return "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400";
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

/** Small badge flagging an expired / soon-to-expire ID. Renders nothing when fine. */
function IdExpiryBadge({ value }: { value?: string | null }) {
  const status = idExpiryStatus(value);
  if (!status) return null;
  const tone =
    status.tone === "red"
      ? "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400"
      : "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
  return (
    <Badge variant="outline" className={tone}>
      {status.label}
    </Badge>
  );
}

// ─── Form types ──────────────────────────────────────────────────────────────

interface EditForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  type: string;
  source: string;
  tagsRaw: string;
  notes: string;
  gender: string;
  nationalId: string;
  idType: string;
  idExpiry: string;
  dob: string;
  maritalStatus: string;
  occupation: string;
  childrenCount: string;
  workStatus: string;
  workInfo: string;
  preferredLanguage: string;
  clientGoal: string;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState<any | null>(null);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);

  const [newActivityType, setNewActivityType] = useState("NOTE");
  const [newActivitySubject, setNewActivitySubject] = useState("");
  const [newActivityBody, setNewActivityBody] = useState("");
  const [activityBusy, setActivityBusy] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await api.crm.get(id);
      setContact(c);
      setForm({
        firstName: c.firstName,
        lastName: c.lastName || "",
        email: c.email,
        phone: c.phone || "",
        address: c.address || "",
        type: c.type,
        source: c.source || "",
        tagsRaw: (c.tags || []).join(", "),
        notes: c.notes || "",
        gender: c.gender || "",
        nationalId: c.nationalId || "",
        idType: c.idType || "",
        idExpiry: toDateInputValue(c.idExpiry),
        dob: toDateInput(c.dob),
        maritalStatus: c.maritalStatus || "",
        occupation: c.occupation || "",
        childrenCount:
          c.childrenCount === null || c.childrenCount === undefined
            ? ""
            : String(c.childrenCount),
        workStatus: c.workStatus || "",
        workInfo: c.workInfo || "",
        preferredLanguage: c.preferredLanguage || "",
        clientGoal: c.clientGoal || "",
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const upd = <K extends keyof EditForm>(k: K, v: EditForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const saveEdits = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api.crm.update(id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        // type (member status) intentionally NOT sent — managed via Members page.
        source: form.source || null,
        tags: form.tagsRaw.split(",").map((t) => t.trim()).filter(Boolean),
        notes: form.notes.trim() || null,
        gender: form.gender || null,
        nationalId: form.nationalId.trim() || null,
        idType: form.idType || null,
        idExpiry: form.idExpiry || null,
        dob: form.dob || null,
        maritalStatus: form.maritalStatus || null,
        occupation: form.occupation.trim() || null,
        childrenCount: form.childrenCount === "" ? null : Number(form.childrenCount),
        workStatus: form.workStatus || null,
        workInfo: form.workInfo.trim() || null,
        preferredLanguage: form.preferredLanguage || null,
        clientGoal: form.clientGoal || null,
      });
      await load();
      setEditing(false);
      toast.success("Contact updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async () => {
    setDeleting(true);
    try {
      await api.crm.delete(id);
      toast.success("Contact deleted");
      router.push("/crm");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const addActivity = async () => {
    if (!newActivityBody.trim() && !newActivitySubject.trim()) return;
    setActivityBusy(true);
    try {
      await api.crm.addActivity(id, {
        type: newActivityType,
        subject: newActivitySubject.trim() || undefined,
        body: newActivityBody.trim() || undefined,
      });
      setNewActivitySubject("");
      setNewActivityBody("");
      await load();
      toast.success("Activity logged");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to log activity");
    } finally {
      setActivityBusy(false);
    }
  };

  const deleteActivity = async (aid: string) => {
    try {
      await api.crm.deleteActivity(id, aid);
      await load();
      toast.success("Activity removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-1" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">{error || "Contact not found"}</p>
        <Button variant="outline" className="mt-4" render={<Link href="/crm" />}>
          <ArrowLeft className="h-4 w-4" /> Back to Contacts
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/crm"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Contacts
        </Link>

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <Avatar size="lg">
              <AvatarFallback className="text-base font-semibold">
                {initials(contact.firstName, contact.lastName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {contact.firstName} {contact.lastName || ""}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StageQuickPicker contact={contact} onChanged={load} />
                <Badge variant="outline" className={typeBadgeClass(contact.type)}>
                  {contact.type}
                </Badge>
                {contact.source && (
                  <Badge variant="outline" className="capitalize">
                    via {contact.source}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <>
                {/* Convert/assign stays as an entry point, but the actual plan
                    assignment happens in the Members page (Contacts is pure CRM). */}
                <Button
                  className="bg-[#FFCF01] text-[#011b2b] hover:bg-[#FFCF01]/90"
                  onClick={() => router.push(`/members?assign=${contact.id}`)}
                >
                  <UserAdd className="h-4 w-4" />{" "}
                  {String(contact.type).toUpperCase() === "MEMBER"
                    ? "Assign plan"
                    : "Convert to member"}
                </Button>
                <Button onClick={() => setEmailOpen(true)}>
                  <Send className="h-4 w-4" /> Send Email
                </Button>
                <PermissionGate permission="crm:edit">
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Edit className="h-4 w-4" /> Edit
                  </Button>
                </PermissionGate>
                <PermissionGate permission="crm:delete">
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash className="h-4 w-4" /> Delete
                  </Button>
                </PermissionGate>
              </>
            ) : (
              <>
                <Button onClick={saveEdits} disabled={saving}>
                  <Check className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    load();
                  }}
                >
                  <Close className="h-4 w-4" /> Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left — profile / classification / demographics / notes */}
        <div className="space-y-5">
          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!editing ? (
                <>
                  <DetailRow icon={<Mail className="h-4 w-4" />} label="Email">
                    <a href={`mailto:${contact.email}`} className="hover:text-primary">
                      {contact.email}
                    </a>
                  </DetailRow>
                  {contact.phone && (
                    <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone">
                      <a href={`tel:${contact.phone}`} className="hover:text-primary">
                        {contact.phone}
                      </a>
                    </DetailRow>
                  )}
                  {contact.address && (
                    <DetailRow icon={<MapPin className="h-4 w-4" />} label="Address">
                      {contact.address}
                    </DetailRow>
                  )}
                </>
              ) : (
                form && (
                  <div className="space-y-3">
                    <TextField label="First name" value={form.firstName} onChange={(v) => upd("firstName", v)} />
                    <TextField label="Last name" value={form.lastName} onChange={(v) => upd("lastName", v)} />
                    <TextField label="Phone" type="tel" value={form.phone} onChange={(v) => upd("phone", v)} />
                    <TextField label="Address" value={form.address} onChange={(v) => upd("address", v)} />
                  </div>
                )
              )}
            </CardContent>
          </Card>

          {/* Classification */}
          <Card>
            <CardHeader>
              <CardTitle>Classification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!editing ? (
                <>
                  <DetailRow icon={<Tag className="h-4 w-4" />} label="Type">
                    <Badge variant="outline" className={typeBadgeClass(contact.type)}>
                      {contact.type}
                    </Badge>
                  </DetailRow>
                  <DetailRow icon={<Tag className="h-4 w-4" />} label="Tags">
                    <div className="flex flex-wrap gap-1">
                      {(contact.tags || []).length === 0 && (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {(contact.tags || []).map((t: string) => (
                        <Badge key={t} variant="outline" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </DetailRow>
                  <DetailRow icon={<Clock className="h-4 w-4" />} label="Added">
                    {formatDateTime(contact.createdAt)}
                  </DetailRow>
                  {contact.lastContactAt && (
                    <DetailRow icon={<Clock className="h-4 w-4" />} label="Last contact">
                      {formatDateTime(contact.lastContactAt)}
                    </DetailRow>
                  )}
                </>
              ) : (
                form && (
                  <div className="space-y-3">
                    {/* Member status (Type) is system-managed via plan assignment in the
                        Members page — not editable here. */}
                    <TextField
                      label="Tags (comma-separated)"
                      value={form.tagsRaw}
                      onChange={(v) => upd("tagsRaw", v)}
                    />
                    <TextField label="Source" value={form.source} onChange={(v) => upd("source", v)} />
                  </div>
                )
              )}
            </CardContent>
          </Card>

          {/* Demographics */}
          <Card>
            <CardHeader>
              <CardTitle>Demographics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!editing ? (
                <DemographicsView contact={contact} />
              ) : (
                form && (
                  <div className="space-y-3">
                    <SelectField label="Gender" value={form.gender} onChange={(v) => upd("gender", v)} options={GENDERS} />
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Date of birth</Label>
                      <Input type="date" value={form.dob} onChange={(e) => upd("dob", e.target.value)} />
                    </div>
                    <SelectField label="ID type" value={form.idType} onChange={(v) => upd("idType", v)} options={ID_TYPES} />
                    <TextField
                      label="National ID / document no."
                      value={form.nationalId}
                      onChange={(v) => upd("nationalId", v)}
                    />
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        ID expiry date (optional)
                      </Label>
                      <Input
                        type="date"
                        value={form.idExpiry}
                        onChange={(e) => upd("idExpiry", e.target.value)}
                      />
                    </div>
                    <SelectField
                      label="Marital status"
                      value={form.maritalStatus}
                      onChange={(v) => upd("maritalStatus", v)}
                      options={MARITAL_STATUSES}
                    />
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Children</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={form.childrenCount}
                        onChange={(e) => upd("childrenCount", e.target.value)}
                      />
                    </div>
                    <TextField label="Occupation" value={form.occupation} onChange={(v) => upd("occupation", v)} />
                    <SelectField
                      label="Work status"
                      value={form.workStatus}
                      onChange={(v) => upd("workStatus", v)}
                      options={WORK_STATUSES}
                    />
                    <TextField
                      label="Work info"
                      value={form.workInfo}
                      onChange={(v) => upd("workInfo", v)}
                      placeholder="Employer, role, sector…"
                    />
                    <SelectField
                      label="Preferred language"
                      value={form.preferredLanguage}
                      onChange={(v) => upd("preferredLanguage", v)}
                      options={PREFERRED_LANGUAGES}
                    />
                    <SelectField
                      label="Goal"
                      value={form.clientGoal}
                      onChange={(v) => upd("clientGoal", v)}
                      options={CLIENT_GOALS}
                    />
                  </div>
                )
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {!editing ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {contact.notes || "No notes."}
                </p>
              ) : (
                form && (
                  <Textarea
                    rows={5}
                    placeholder="Private notes about this contact…"
                    value={form.notes}
                    onChange={(e) => upd("notes", e.target.value)}
                  />
                )
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right — follow-ups, memberships, family, email history, activity, bookings, invoices */}
        <div className="space-y-5 lg:col-span-2">
          <FollowUpsBlock
            contactId={contact.id}
            followUps={contact.followUps || []}
            onChanged={load}
          />

          <MembershipsBlock memberships={contact.memberships || []} />

          <FamilyMembersBlock familyMembers={contact.familyMembers || []} />

          <EmailHistory activities={contact.activities || []} />

          {/* Activity timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Select
                    items={ACTIVITY_TYPES}
                    value={newActivityType}
                    onValueChange={(v) => setNewActivityType(v ?? "NOTE")}
                  >
                    <SelectTrigger className="w-full" aria-label="Activity type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIVITY_TYPES.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="md:col-span-2"
                    placeholder="Subject (optional)"
                    value={newActivitySubject}
                    onChange={(e) => setNewActivitySubject(e.target.value)}
                  />
                </div>
                <Textarea
                  rows={2}
                  placeholder="What happened? Details, outcomes, follow-up…"
                  value={newActivityBody}
                  onChange={(e) => setNewActivityBody(e.target.value)}
                />
                <Button
                  onClick={addActivity}
                  disabled={
                    activityBusy || (!newActivitySubject.trim() && !newActivityBody.trim())
                  }
                >
                  <Plus className="h-4 w-4" />
                  {activityBusy ? "Logging…" : "Log activity"}
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                {(contact.activities || []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No activities yet.</p>
                ) : (
                  (contact.activities || []).map((a: any) => (
                    <div
                      key={a.id}
                      className="group rounded-md border p-3 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {String(a.type).replace(/_/g, " ").toLowerCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(a.createdAt)}
                            </span>
                          </div>
                          {a.subject && <p className="mt-1 text-sm font-medium">{a.subject}</p>}
                          {a.body && (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                              {a.body}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => deleteActivity(a.id)}
                          aria-label="Delete activity"
                        >
                          <Trash className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bookings */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Bookings
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {(contact.bookings || []).length} total
              </span>
            </CardHeader>
            <CardContent>
              {(contact.bookings || []).length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No bookings for this contact yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Facility</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contact.bookings.map((b: any) => (
                        <TableRow key={b.id}>
                          <TableCell>{b.facility?.name || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(b.date)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {b.startTime}–{b.endTime}
                          </TableCell>
                          <TableCell className="text-right">
                            {b.totalPrice ? formatSAR(b.totalPrice) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className={statusBadgeClass(b.status)}>
                              {b.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoices */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Invoices
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {(contact.invoices || []).length} total
              </span>
            </CardHeader>
            <CardContent>
              {(contact.invoices || []).length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Issued</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                        <TableHead className="text-right">Open</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contact.invoices.map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(inv.issueDate)}
                          </TableCell>
                          <TableCell className="text-right">{formatSAR(inv.total)}</TableCell>
                          <TableCell className="text-right text-[#FFCF01]">
                            {formatSAR(inv.balance)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className={statusBadgeClass(inv.status)}>
                              {inv.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              render={<Link href={`/billing/invoices/${inv.id}`} />}
                              aria-label="Open invoice"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Send Email dialog */}
      <SendEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        contact={contact}
        onSent={load}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this contact?"
        description="Their activity log and booking links will be removed. Invoices will remain but unlinked."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={deleteContact}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon && <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-foreground">{children}</div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select items={options} value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value || "__empty"} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Searchable nationality picker — bound value stays a plain string. */
function NationalitySelect({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Combobox
        items={NATIONALITY_OPTIONS}
        value={value || null}
        onValueChange={(v) => onChange(v ?? "")}
      >
        <ComboboxInput
          id={id}
          className="w-full"
          placeholder="Search nationality…"
          showClear={!!value}
        />
        <ComboboxContent>
          <ComboboxEmpty>No nationality found.</ComboboxEmpty>
          <ComboboxList>
            {(item: { value: string; label: string }) => (
              <ComboboxItem key={item.value} value={item.value}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

function DemographicsView({ contact }: { contact: any }) {
  const gender = labelFor(GENDERS, contact.gender);
  const idType = labelFor(ID_TYPES, contact.idType);
  const marital = labelFor(MARITAL_STATUSES, contact.maritalStatus);
  const work = labelFor(WORK_STATUSES, contact.workStatus);
  const language = labelFor(PREFERRED_LANGUAGES, contact.preferredLanguage);
  const goal = labelFor(CLIENT_GOALS, contact.clientGoal);
  const hasChildren = contact.childrenCount !== null && contact.childrenCount !== undefined;
  const any =
    gender ||
    idType ||
    marital ||
    work ||
    contact.dob ||
    contact.nationalId ||
    contact.idExpiry ||
    contact.occupation ||
    contact.workInfo ||
    hasChildren ||
    language ||
    goal;

  if (!any) {
    return <p className="text-sm text-muted-foreground">No demographic details recorded.</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      {gender && <DetailRow icon={<User className="h-4 w-4" />} label="Gender">{gender}</DetailRow>}
      {contact.dob && (
        <DetailRow icon={<Calendar className="h-4 w-4" />} label="Date of birth">
          {formatDate(contact.dob)}
        </DetailRow>
      )}
      {(idType || contact.nationalId || contact.idExpiry) && (
        <DetailRow icon={<Tag className="h-4 w-4" />} label="ID">
          <div className="flex flex-wrap items-center gap-2">
            <span>{[idType, contact.nationalId].filter(Boolean).join(" · ") || "—"}</span>
            <IdExpiryBadge value={contact.idExpiry} />
          </div>
          {contact.idExpiry && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Expires {formatDate(contact.idExpiry)}
            </p>
          )}
        </DetailRow>
      )}
      {marital && (
        <DetailRow icon={<UsersIcon className="h-4 w-4" />} label="Marital status">
          {marital}
        </DetailRow>
      )}
      {hasChildren && (
        <DetailRow icon={<UsersIcon className="h-4 w-4" />} label="Children">
          {contact.childrenCount}
        </DetailRow>
      )}
      {(contact.occupation || work) && (
        <DetailRow icon={<Briefcase className="h-4 w-4" />} label="Work">
          {[contact.occupation, work].filter(Boolean).join(" · ") || "—"}
        </DetailRow>
      )}
      {contact.workInfo && (
        <DetailRow icon={<Briefcase className="h-4 w-4" />} label="Work info">
          {contact.workInfo}
        </DetailRow>
      )}
      {language && (
        <DetailRow icon={<Chat className="h-4 w-4" />} label="Preferred language">
          {language}
        </DetailRow>
      )}
      {goal && (
        <DetailRow icon={<Tag className="h-4 w-4" />} label="Goal">
          {goal}
        </DetailRow>
      )}
    </div>
  );
}

/** Inline stage selector — clicking the pill opens a popover with the six stages. */
function StageQuickPicker({ contact, onChanged }: { contact: any; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const change = async (next: string) => {
    if (next === contact.stage) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await api.crm.setStage(contact.id, next);
      onChanged?.();
      toast.success(`Stage moved to ${labelFor(STAGES, next)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update stage");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={busy}
            title="Change stage"
            className={`inline-flex h-5 items-center gap-1 rounded-4xl border px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${stageBadgeClass(
              contact.stage,
            )}`}
          />
        }
      >
        {contact.stage}
        <ChevronDown className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        {STAGES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => change(s.value)}
            className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${
              s.value === contact.stage ? "font-semibold text-primary" : ""
            }`}
          >
            {s.label}
            {s.value === contact.stage && <Check className="h-3.5 w-3.5" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Email history — filters the activity timeline down to EMAIL entries. */
function EmailHistory({ activities }: { activities: any[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const emails = (activities || []).filter((a) => a.type === "EMAIL");
  if (emails.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4" /> Email history
        </CardTitle>
        <span className="text-xs text-muted-foreground">{emails.length} sent</span>
      </CardHeader>
      <CardContent className="divide-y">
        {emails.map((e) => {
          const meta = e.metadata || {};
          const sent = meta.sent !== false;
          const isOpen = expanded === e.id;
          return (
            <div key={e.id} className="py-2 first:pt-0 last:pb-0">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : e.id)}
                className="flex w-full items-start gap-3 text-left"
              >
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                    sent ? "text-primary" : "border-destructive/40 text-destructive"
                  }`}
                >
                  <Mail className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{e.subject || "(no subject)"}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(e.createdAt)}
                    </span>
                  </div>
                  {!isOpen && e.body && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {e.body.replace(/\s+/g, " ")}
                    </p>
                  )}
                  {!sent && meta.error && (
                    <p className="mt-1 text-xs text-destructive">
                      Delivery failed: {String(meta.error)}
                    </p>
                  )}
                </div>
              </button>
              {isOpen && (
                <div className="mt-2 ml-10 border-l pl-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Sent to: <span className="font-mono text-foreground">{meta.to || "—"}</span>
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {e.body}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Memberships linked to this contact (plan name + type + status + dates). */
function MembershipsBlock({ memberships }: { memberships: any[] }) {
  const rows = memberships || [];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Memberships</CardTitle>
        <Link
          href="/members"
          className="text-xs font-medium text-muted-foreground hover:text-primary"
        >
          {rows.length} total →
        </Link>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No memberships linked to this contact yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.plan?.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {labelFor(PLAN_TYPES, m.plan?.type) || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.startDate ? formatDate(m.startDate) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.endDate ? formatDate(m.endDate) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={statusBadgeClass(m.status)}>
                        {m.status || "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Family members (dependents) linked to this contact. */
function FamilyMembersBlock({ familyMembers }: { familyMembers: any[] }) {
  const rows = familyMembers || [];
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="h-4 w-4" /> Family members
        </CardTitle>
        <span className="text-xs text-muted-foreground">{rows.length} total</span>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((f: any) => {
          const name = [f.firstName, f.lastName].filter(Boolean).join(" ") || f.name || "—";
          const age = ageFromDob(f.dob);
          const meta = [
            f.relation || f.relationship,
            f.dob
              ? `${formatDate(f.dob)}${age !== null ? ` · ${age}y` : ""}`
              : age !== null
                ? `${age}y`
                : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={f.id} className="flex items-center gap-3 rounded-md border p-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-[10px] font-semibold">
                  {initials(f.firstName || f.name, f.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">{meta || "—"}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Follow-up scheduler — list, schedule, complete, delete. */
function FollowUpsBlock({
  contactId,
  followUps = [],
  onChanged,
}: {
  contactId: string;
  followUps: any[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("call");
  const [subject, setSubject] = useState("");
  const [dueAt, setDueAt] = useState(() => {
    const t = new Date();
    t.setHours(t.getHours() + 1, 0, 0, 0);
    const off = t.getTimezoneOffset();
    return new Date(t.getTime() - off * 60000).toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!subject.trim()) return;
    setSaving(true);
    try {
      await api.crm.createFollowUp(contactId, {
        type,
        subject: subject.trim(),
        notes: notes.trim() || null,
        dueAt: new Date(dueAt).toISOString(),
      });
      setSubject("");
      setNotes("");
      setOpen(false);
      onChanged?.();
      toast.success("Follow-up scheduled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule follow-up");
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (f: any) => {
    try {
      await api.crm.updateFollowUp(f.id, { completed: !f.completed });
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update follow-up");
    }
  };

  const remove = async (fid: string) => {
    try {
      await api.crm.deleteFollowUp(fid);
      onChanged?.();
      toast.success("Follow-up removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete follow-up");
    }
  };

  const sorted = [...followUps].sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
  );
  const openCount = sorted.filter((f) => !f.completed).length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4" /> Follow-ups
          {openCount > 0 && <span className="font-semibold text-amber-500">· {openCount}</span>}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-3.5 w-3.5" />
          {open ? "Cancel" : "Schedule"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {open && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Select items={FOLLOWUP_TYPES} value={type} onValueChange={(v) => setType(v ?? "call")}>
                <SelectTrigger className="w-full" aria-label="Follow-up type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOWUP_TYPES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                aria-label="Due date"
              />
            </div>
            <Input
              placeholder="What needs doing? (e.g. Quote follow-up call)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
              rows={2}
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button onClick={submit} disabled={saving || !subject.trim()} size="sm">
              <Plus className="h-4 w-4" />
              {saving ? "Saving…" : "Schedule"}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {sorted.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No follow-ups scheduled.
            </p>
          ) : (
            sorted.map((f) => {
              const due = new Date(f.dueAt);
              const overdue = !f.completed && due < new Date();
              return (
                <div
                  key={f.id}
                  className={`flex items-start gap-3 rounded-md border p-3 ${
                    f.completed
                      ? "opacity-60"
                      : overdue
                        ? "border-rose-500/30 bg-rose-500/5"
                        : "hover:border-primary/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleComplete(f)}
                    aria-label={f.completed ? "Mark incomplete" : "Mark complete"}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      f.completed
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    {f.completed && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p
                        className={`text-sm font-medium ${
                          f.completed ? "text-muted-foreground line-through" : ""
                        }`}
                      >
                        <span className="mr-2 text-xs uppercase text-muted-foreground">
                          {f.type}
                        </span>
                        {f.subject}
                      </p>
                      <span
                        className={`font-mono text-xs ${
                          overdue ? "text-rose-500" : "text-muted-foreground"
                        }`}
                      >
                        {due.toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {f.notes && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                        {f.notes}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(f.id)}
                    aria-label="Delete follow-up"
                  >
                    <Trash className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Compose-email dialog with quick templates. */
function SendEmailDialog({
  open,
  onOpenChange,
  contact,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: any;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setSubject("");
      setBody("");
    }
  }, [open]);

  const applyTemplate = (t: (typeof EMAIL_TEMPLATES)[number]) => {
    setSubject(t.subject);
    setBody(t.body);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and message are required.");
      return;
    }
    setSending(true);
    try {
      await api.crm.sendEmail(contact.id, {
        subject: subject.trim(),
        body: body.trim(),
      });
      toast.success("Email sent");
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Compose email
          </DialogTitle>
          <DialogDescription>
            To {contact.firstName} {contact.lastName || ""} — {contact.email}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {EMAIL_TEMPLATES.map((t) => (
              <Button
                key={t.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyTemplate(t)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this about?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message… We'll wrap it in the Vision7 branded email template automatically."
              required
            />
            <p className="text-xs text-muted-foreground">
              Plain text — line breaks preserved. Sent as HTML with the Vision7 header and footer
              from noreply@app.vision7.sa.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={sending || !subject.trim() || !body.trim()}>
              <Send className="h-4 w-4" />
              {sending ? "Sending…" : "Send email"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Assign a membership plan to this contact (a.k.a. convert to member). */
function AssignPlanDialog({
  open,
  onOpenChange,
  contact,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: any;
  onAssigned: () => void;
}) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState(() => toDateInput(new Date().toISOString()));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // Billing — every paid membership is invoiced. Modes:
  //  "now"     → collect the full price now (payNow:true)
  //  "deposit" → collect a partial amount now; balance stays owed (depositAmount)
  //  "later"   → issue an open invoice, nothing collected (payNow:false)
  //  "tabby" / "tamara" → BNPL pay-link: backend creates the link + emails it
  //  "manual"  → record an externally-taken BNPL payment by reference
  const [billingMode, setBillingMode] = useState<
    "now" | "deposit" | "later" | "tabby" | "tamara" | "manual"
  >("now");
  const [depositAmount, setDepositAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  // Manual-reference sub-select: which BNPL provider the reference belongs to.
  const [bnplProvider, setBnplProvider] = useState<"tabby" | "tamara">("tabby");
  // Gateway availability — disables Tabby/Tamara when keys aren't configured.
  const [providers, setProviders] = useState<
    Array<{ provider: "tabby" | "tamara" | "stripe"; enabled: boolean }>
  >([]);
  // Pay-link result returned by assign for tabby/tamara — shown with a Copy button.
  const [payLink, setPayLink] = useState<{ url: string; provider: string } | null>(null);
  // ID capture — recorded onto the subject (athlete or CRM contact) when provided.
  const [idType, setIdType] = useState("NATIONAL_ID");
  const [idNumber, setIdNumber] = useState("");
  const [idExpiry, setIdExpiry] = useState("");

  // Athlete provisioning fields (only used for academy plans without a linked athlete).
  const [athleteDob, setAthleteDob] = useState("");
  const [athletePosition, setAthletePosition] = useState("MIDFIELDER");
  const [athleteJersey, setAthleteJersey] = useState("");
  const [athleteNationality, setAthleteNationality] = useState("");
  // Warn (don't block) when the person already holds an active/pending membership.
  const [existingActive, setExistingActive] = useState<any[]>([]);
  const [confirmDup, setConfirmDup] = useState(false);

  // Load plans whenever the dialog opens; reset the form.
  useEffect(() => {
    if (!open) return;
    setPlanId("");
    setExistingActive([]);
    setConfirmDup(false);
    setStartDate(toDateInput(new Date().toISOString()));
    setEndDate("");
    setNotes("");
    setAthleteDob(toDateInput(contact?.dob) || "");
    setAthletePosition("MIDFIELDER");
    setAthleteJersey("");
    setAthleteNationality("");
    setIdType(contact?.idType || "NATIONAL_ID");
    setIdNumber(contact?.nationalId || "");
    setIdExpiry(toDateInputValue(contact?.idExpiry));
    setBillingMode("now");
    setDepositAmount("");
    setPaymentMethod("cash");
    setPaymentReference("");
    setBnplProvider("tabby");
    setPayLink(null);
    let cancelled = false;
    // Which BNPL gateways are configured — Tabby/Tamara options are disabled
    // (with a hint to add keys in Settings) when their provider is not enabled.
    (async () => {
      try {
        const res = await api.payments.providers();
        if (!cancelled) setProviders(Array.isArray(res) ? res : []);
      } catch {
        if (!cancelled) setProviders([]);
      }
    })();
    (async () => {
      setLoadingPlans(true);
      try {
        const res = await api.plans.list({ limit: 1000 });
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : (res as any)?.data || [];
        setPlans(rows.filter((p: any) => p.active !== false));
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load plans");
        }
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    })();
    // Surface any active/pending membership this person already holds.
    (async () => {
      try {
        const calls: Promise<any>[] = [api.memberships.list({ crmContactId: contact.id, limit: 50 })];
        if (contact?.linkedAthleteId) calls.push(api.memberships.list({ athleteId: contact.linkedAthleteId, limit: 50 }));
        const results = await Promise.all(calls);
        if (cancelled) return;
        const all = results.flatMap((r) => (Array.isArray(r) ? r : r?.data || []));
        setExistingActive(
          all.filter((m: any) => ["ACTIVE", "PENDING"].includes(String(m.status).toUpperCase())),
        );
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedPlan = plans.find((p) => p.id === planId);

  // Academy plans (requiresAthlete) must be tied to an athlete. If the contact
  // already has one we reuse it; otherwise we provision a new athlete profile.
  const requiresAthlete = selectedPlan?.requiresAthlete === true;
  const linkedAthleteId = contact?.linkedAthleteId;
  const needsAthleteDetails = requiresAthlete && !linkedAthleteId;

  // Auto-fill end date from the plan's durationDays when plan or start date changes.
  useEffect(() => {
    if (!selectedPlan?.durationDays || !startDate) return;
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start);
    end.setDate(end.getDate() + Number(selectedPlan.durationDays));
    setEndDate(toDateInput(end.toISOString()));
  }, [planId, startDate, selectedPlan]);

  const planOptions: Option[] = plans.map((p) => {
    const typeLabel = labelFor(PLAN_TYPES, p.type);
    return {
      value: p.id,
      label: `${p.name}${p.price != null ? ` — ${formatSAR(p.price)}` : ""}${
        typeLabel ? ` · ${typeLabel}` : ""
      }`,
    };
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId) {
      toast.error("Pick a plan to assign.");
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
    if (existingActive.length && !confirmDup) {
      toast.error("This person already has an active/pending membership — tick the box to add another.");
      return;
    }
    const planPrice = Number(selectedPlan?.price) || 0;
    // Deposit mode: validate 0 < amount < plan price before we hit the API.
    const depositValue = Number(depositAmount);
    if (planPrice > 0 && billingMode === "deposit") {
      if (!Number.isFinite(depositValue) || depositValue <= 0) {
        toast.error("Enter a deposit amount greater than 0.");
        return;
      }
      if (depositValue >= planPrice) {
        toast.error("Deposit must be less than the full price — use “Pay in full now” for the full amount.");
        return;
      }
    }
    // BNPL pay-link modes need their gateway configured (keys in Settings).
    if (planPrice > 0 && (billingMode === "tabby" || billingMode === "tamara")) {
      if (!providers.find((p) => p.provider === billingMode)?.enabled) {
        toast.error(`${billingMode === "tabby" ? "Tabby" : "Tamara"} is not configured — add keys in Settings.`);
        return;
      }
    }
    // Manual BNPL reference requires the reference text.
    if (planPrice > 0 && billingMode === "manual" && !paymentReference.trim()) {
      toast.error("Enter the BNPL payment reference.");
      return;
    }
    setSaving(true);
    // Shared billing fields for the assign payload, derived from the billing mode.
    //  now            → payNow:true + method/ref
    //  deposit        → depositAmount + method/ref (no payNow:true; balance stays owed)
    //  later          → neither (payNow:false)
    //  tabby / tamara → paymentMethod only; backend returns a payLink (no payNow/deposit)
    //  manual         → manual-reference + bnplProvider + paymentReference
    const billingPayload: Record<string, unknown> =
      planPrice <= 0
        ? { payNow: true }
        : billingMode === "now"
          ? { payNow: true, paymentMethod, paymentReference: paymentReference.trim() || undefined }
          : billingMode === "deposit"
            ? { depositAmount: depositValue, paymentMethod, paymentReference: paymentReference.trim() || undefined }
            : billingMode === "tabby" || billingMode === "tamara"
              ? { paymentMethod: billingMode }
              : billingMode === "manual"
                ? {
                    paymentMethod: "manual-reference",
                    bnplProvider,
                    paymentReference: paymentReference.trim(),
                  }
                : { payNow: false };
    const billingToast = (status?: string) =>
      planPrice <= 0
        ? "Membership assigned — activated (free plan)"
        : billingMode === "manual"
          ? "BNPL reference recorded — invoice raised against the membership"
          : status === "ACTIVE"
            ? "Payment recorded — contact is now an active Member"
            : billingMode === "deposit"
              ? "Deposit recorded — invoice raised, balance owed (membership pending)"
              : "Invoice raised — membership pending until paid";
    const isPayLinkMode = billingMode === "tabby" || billingMode === "tamara";
    try {
      let res: any;
      if (needsAthleteDetails) {
        // 1. Provision the athlete (creates a user login + auto-links a CRM contact).
        const athlete = await api.athletes.create({
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          dob: athleteDob,
          position: athletePosition,
          jerseyNumber: Number(athleteJersey) || 0,
          nationality: athleteNationality.trim() || undefined,
          gender: contact.gender || undefined,
          idType,
          idNumber: idNumber.trim() || undefined,
          idExpiry: idExpiry || null,
        });
        // 2. Bill for the plan, tied to the freshly created athlete.
        res = await api.memberships.assign({
          athleteId: athlete.id,
          planId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes.trim() || undefined,
          ...billingPayload,
        });
        if (!isPayLinkMode)
          toast.success(
            billingMode === "manual"
              ? "Athlete profile created — BNPL reference recorded"
              : res?.membership?.status === "ACTIVE"
                ? "Athlete profile created + membership active — they can log into the platform"
                : "Athlete profile created — invoice raised, membership pending until paid",
          );
      } else if (requiresAthlete && linkedAthleteId) {
        // Academy plan, contact already has an athlete — bill via athleteId.
        if (idNumber.trim() || idExpiry) {
          await api.athletes.update(linkedAthleteId, {
            idType,
            idNumber: idNumber.trim() || undefined,
            idExpiry: idExpiry || null,
          });
        }
        res = await api.memberships.assign({
          athleteId: linkedAthleteId,
          planId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes.trim() || undefined,
          ...billingPayload,
        });
        if (!isPayLinkMode) toast.success(billingToast(res?.membership?.status));
      } else {
        // Non-academy plan — bill directly to the CRM contact.
        if (idNumber.trim() || idExpiry) {
          await api.crm.update(contact.id, {
            idType,
            nationalId: idNumber.trim() || undefined,
            idExpiry: idExpiry || null,
          });
        }
        res = await api.memberships.assign({
          crmContactId: contact.id,
          planId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes.trim() || undefined,
          ...billingPayload,
        });
        if (!isPayLinkMode) toast.success(billingToast(res?.membership?.status));
      }
      onAssigned?.();
      // Pay-link modes: surface the returned link (Copy + emailed note) and keep
      // the dialog open so staff can copy it. Other modes close as before.
      if (isPayLinkMode && res?.payLink?.url) {
        setPayLink({ url: res.payLink.url, provider: res.payLink.provider || billingMode });
        toast.success(`${billingMode === "tabby" ? "Tabby" : "Tamara"} pay-link created`);
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign membership");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-4 w-4" /> Assign plan
          </DialogTitle>
          <DialogDescription>
            Assign a membership plan to {contact.firstName} {contact.lastName || ""}.{" "}
            {String(contact.type).toUpperCase() !== "MEMBER" && (
              <>This converts them into a Member.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {existingActive.length > 0 && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700/50 dark:bg-amber-950/30">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Already has {existingActive.length} active/pending membership
                {existingActive.length > 1 ? "s" : ""}
              </p>
              <ul className="ml-4 list-disc text-xs text-amber-700 dark:text-amber-300">
                {existingActive.slice(0, 4).map((m) => (
                  <li key={m.id}>
                    {m.plan?.name || "Plan"} — {String(m.status).toLowerCase()}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                <input type="checkbox" checked={confirmDup} onChange={(e) => setConfirmDup(e.target.checked)} />
                Add another membership anyway
              </label>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select
              items={planOptions}
              value={planId}
              onValueChange={(v) => setPlanId(v ?? "")}
              disabled={loadingPlans}
            >
              <SelectTrigger className="w-full" aria-label="Plan">
                <SelectValue
                  placeholder={loadingPlans ? "Loading plans…" : "Select a plan…"}
                />
              </SelectTrigger>
              <SelectContent>
                {planOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingPlans && plans.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No plans available.{" "}
                <Link href="/memberships/plans" className="text-primary hover:underline">
                  Create one →
                </Link>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-start">Start date</Label>
              <Input
                id="assign-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-end">End date (optional)</Label>
              <Input
                id="assign-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-notes">Notes (optional)</Label>
            <Textarea
              id="assign-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to record about this membership…"
            />
          </div>

          {/* ID capture — optional; recorded onto the member's profile. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField
              label="ID type"
              value={idType}
              onChange={(v) => setIdType(v || "NATIONAL_ID")}
              options={ID_TYPES}
            />
            <div className="space-y-1.5">
              <Label htmlFor="assign-id-number">ID number (optional)</Label>
              <Input
                id="assign-id-number"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="e.g. 1xxxxxxxxx"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-id-expiry">ID expiry date (optional)</Label>
              <Input
                id="assign-id-expiry"
                type="date"
                value={idExpiry}
                onChange={(e) => setIdExpiry(e.target.value)}
              />
            </div>
          </div>

          {/* Billing — every membership is billed; no free passes. */}
          {planId
            ? (() => {
                const price = Number(selectedPlan?.price) || 0;
                if (price <= 0) {
                  return (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                      Free plan — no payment required. The membership activates immediately.
                    </div>
                  );
                }
                const collectsPayment = billingMode === "now" || billingMode === "deposit";
                const tabbyEnabled = providers.find((p) => p.provider === "tabby")?.enabled ?? false;
                const tamaraEnabled = providers.find((p) => p.provider === "tamara")?.enabled ?? false;
                return (
                  <div className="space-y-3 rounded-md border p-3">
                    <span className="text-sm font-medium">Billing — {formatSAR(price)}</span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setBillingMode("now")}
                        className={`rounded-md border px-3 py-2 text-sm ${billingMode === "now" ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"}`}
                      >
                        Pay in full now
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingMode("deposit")}
                        className={`rounded-md border px-3 py-2 text-sm ${billingMode === "deposit" ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"}`}
                      >
                        Take a deposit
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingMode("later")}
                        className={`rounded-md border px-3 py-2 text-sm ${billingMode === "later" ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"}`}
                      >
                        Invoice — pay later
                      </button>
                      <button
                        type="button"
                        disabled={!tabbyEnabled}
                        title={!tabbyEnabled ? "Add keys in Settings" : undefined}
                        onClick={() => setBillingMode("tabby")}
                        className={`rounded-md border px-3 py-2 text-sm ${billingMode === "tabby" ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"} disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Tabby (pay-link)
                      </button>
                      <button
                        type="button"
                        disabled={!tamaraEnabled}
                        title={!tamaraEnabled ? "Add keys in Settings" : undefined}
                        onClick={() => setBillingMode("tamara")}
                        className={`rounded-md border px-3 py-2 text-sm ${billingMode === "tamara" ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"} disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Tamara (pay-link)
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingMode("manual")}
                        className={`rounded-md border px-3 py-2 text-sm ${billingMode === "manual" ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/50"}`}
                      >
                        Manual BNPL reference
                      </button>
                    </div>
                    {(billingMode === "tabby" || billingMode === "tamara") &&
                      !(billingMode === "tabby" ? tabbyEnabled : tamaraEnabled) && (
                        <p className="text-xs text-muted-foreground">Add keys in Settings.</p>
                      )}
                    {billingMode === "deposit" && (
                      <div className="space-y-2">
                        <TextField
                          label="Deposit amount (SAR)"
                          type="number"
                          value={depositAmount}
                          onChange={setDepositAmount}
                          placeholder={`0 – ${price}`}
                        />
                        <div className="flex flex-wrap gap-2">
                          {[0.25, 0.5, 0.75].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() =>
                                setDepositAmount(String(Math.round(price * pct * 100) / 100))
                              }
                              className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted/50"
                            >
                              {Math.round(pct * 100)}% · {formatSAR(Math.round(price * pct * 100) / 100)}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          The deposit is collected now via the method below. An invoice is raised and
                          the remaining balance stays <strong>owed</strong> — the member stays{" "}
                          <strong>pending</strong> until it&apos;s settled.
                        </p>
                      </div>
                    )}
                    {collectsPayment ? (
                      <>
                        <SelectField
                          label="Payment method"
                          value={paymentMethod}
                          onChange={(v) => setPaymentMethod(v || "cash")}
                          options={[
                            { value: "cash", label: "Cash" },
                            { value: "card", label: "Card" },
                            { value: "bank-transfer", label: "Bank transfer" },
                            { value: "cheque", label: "Cheque" },
                          ]}
                        />
                        <TextField
                          label="Reference / Transaction ID"
                          value={paymentReference}
                          onChange={setPaymentReference}
                          placeholder="Transaction ID, cheque no., bank ref…"
                        />
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
                            Pay-link emailed to {contact.email || "the customer"}.
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          A {billingMode === "tamara" ? "Tamara" : "Tabby"} pay-link will be created and
                          emailed to {contact.email || "the customer"}. The membership stays{" "}
                          <strong>pending</strong> until they complete payment.
                        </p>
                      )
                    ) : billingMode === "manual" ? (
                      <>
                        <SelectField
                          label="BNPL provider"
                          value={bnplProvider}
                          onChange={(v) => setBnplProvider(v === "tamara" ? "tamara" : "tabby")}
                          options={[
                            { value: "tabby", label: "Tabby" },
                            { value: "tamara", label: "Tamara" },
                          ]}
                        />
                        <TextField
                          label="Reference / Transaction ID"
                          value={paymentReference}
                          onChange={setPaymentReference}
                          placeholder="BNPL order / payment reference…"
                        />
                        <p className="text-xs text-muted-foreground">
                          Records a payment already taken through {bnplProvider === "tamara" ? "Tamara" : "Tabby"}{" "}
                          outside the system, by reference.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        An invoice will be issued. The member stays <strong>pending</strong> (no access) until it&apos;s paid.
                      </p>
                    )}
                  </div>
                );
              })()
            : null}

          {needsAthleteDetails && (
            <div className="space-y-3 rounded-md border border-[#FFCF01]/40 bg-[#FFCF01]/10 p-3 text-sm">
              <div>
                <p className="font-medium text-foreground">Athlete details</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This academy plan needs an athlete profile. We&apos;ll create one (with an app
                  login) and tie the membership to it — all in one click.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="athlete-dob">Date of birth</Label>
                  <Input
                    id="athlete-dob"
                    type="date"
                    value={athleteDob}
                    onChange={(e) => setAthleteDob(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="athlete-jersey">Jersey number</Label>
                  <Input
                    id="athlete-jersey"
                    type="number"
                    min="0"
                    placeholder="e.g. 10"
                    value={athleteJersey}
                    onChange={(e) => setAthleteJersey(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Position</Label>
                  <Select
                    items={ATHLETE_POSITIONS}
                    value={athletePosition}
                    onValueChange={(v) => setAthletePosition(v ?? "")}
                  >
                    <SelectTrigger className="w-full" aria-label="Position">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ATHLETE_POSITIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <NationalitySelect
                  id="athlete-nationality"
                  label="Nationality (optional)"
                  value={athleteNationality}
                  onChange={setAthleteNationality}
                />
              </div>
            </div>
          )}

          {requiresAthlete && linkedAthleteId && (
            <p className="text-xs text-muted-foreground">
              Academy plan — this membership will be tied to the contact&apos;s existing athlete
              profile.
            </p>
          )}

          <DialogFooter>
            {payLink ? (
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !planId}>
                  <UserAdd className="h-4 w-4" />
                  {saving
                    ? needsAthleteDetails
                      ? "Creating…"
                      : "Assigning…"
                    : needsAthleteDetails
                      ? "Create athlete + assign"
                      : "Assign plan"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
