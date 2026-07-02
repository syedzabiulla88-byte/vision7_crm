"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { api } from "@/lib/api";
import { PermissionGate } from "@/components/shared/permission-gate";
import { usePermissions } from "@/components/hooks/use-permissions";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  ClipboardCheck,
  Warning,
  Mail,
  Phone,
  ArrowRight,
  UserAdd,
  Folder as Archive,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Search,
  Plus,
  Eye,
  Upload,
  Download,
} from "@/lib/icons";

// ─── Types (mirror the live backend contract) ────────────────────────────────────

type EnquiryStatus = "NEW" | "CONVERTED" | "ARCHIVED";

type EnquiryKind = "academy" | "leisure";

interface Enquiry {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  source: string;
  interest: string;
  status: EnquiryStatus;
  contactId: string | null;
  createdAt: string;
  handledAt?: string | null;
  matchedContact: { id: string; name: string } | null;
  kind?: EnquiryKind | null;
  details?: Record<string, unknown> | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const TABS: { value: EnquiryStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "CONVERTED", label: "Converted" },
  { value: "ARCHIVED", label: "Archived" },
];

const STATUS_BADGE: Record<EnquiryStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  NEW: { label: "New", variant: "default" },
  CONVERTED: { label: "Converted", variant: "secondary" },
  ARCHIVED: { label: "Archived", variant: "outline" },
};

const KIND_BADGE: Record<EnquiryKind, { label: string; variant: "default" | "secondary" | "outline" }> = {
  academy: { label: "Academy", variant: "default" },
  leisure: { label: "Leisure", variant: "secondary" },
};

const EMPTY_TITLE: Record<EnquiryStatus, string> = {
  NEW: "No new enquiries",
  CONVERTED: "No converted enquiries",
  ARCHIVED: "No archived enquiries",
};

const EMPTY_DESC: Record<EnquiryStatus, string> = {
  NEW: "New enquiries from the website and other channels will land here.",
  CONVERTED: "Enquiries you turn into contacts will show up here.",
  ARCHIVED: "Enquiries you archive will be kept here for reference.",
};

// Sentinel for "Other" select options — when chosen we reveal a free-text input.
const OTHER = "Other";

const LANGUAGE_OPTIONS = ["Arabic", "English"];

const ACADEMY_PROGRAMS = [
  "Academy",
  "Junior",
  "Elite",
  "Goalkeeping",
  "Holiday camp",
  OTHER,
];
const ACADEMY_GOALS = ["Improve skills", "Competitive", "Fitness", "Social", OTHER];
const ACADEMY_LEVELS = ["Beginner", "Intermediate", "Advanced"];
const ENQUIRING_FOR = ["My child", "Myself"];
const GENDERS = ["Male", "Female"];

const LEISURE_INTERESTS = [
  "Gym",
  "Padel",
  "Swimming",
  "Wellness",
  "Personal Training",
  OTHER,
];
const LEISURE_MEMBERSHIPS = ["Individual", "Family", "Corporate"];
const LEISURE_GOALS = [
  "Weight Loss",
  "Muscle Building",
  "Improve Fitness",
  "Better Social Life",
  OTHER,
];
const LEISURE_EXPERIENCE = ["Beginner", "Intermediate", "Advanced"];
const LEISURE_TIMES = ["Morning", "Afternoon", "Evening"];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fullName(e: Enquiry): string {
  return `${e.firstName || ""} ${e.lastName || ""}`.trim() || "(no name)";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function truncate(text: string, max = 80): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd() + "…";
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

// ─── Import (CSV / XLSX) ──────────────────────────────────────────────────────────

// Canonical fields accepted by the backend importer.
const IMPORT_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "source",
  "interest",
  "kind",
  "message",
] as const;

type ImportField = (typeof IMPORT_FIELDS)[number] | "name";

interface ImportRow {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  interest?: string;
  kind?: string;
  message?: string;
}

// Map common header variants (lowercased, trimmed) → canonical field name.
const HEADER_ALIASES: Record<string, ImportField> = {
  "first name": "firstName",
  firstname: "firstName",
  "last name": "lastName",
  lastname: "lastName",
  name: "name",
  "full name": "name",
  fullname: "name",
  email: "email",
  "email address": "email",
  phone: "phone",
  mobile: "phone",
  "phone number": "phone",
  contact: "phone",
  source: "source",
  interest: "interest",
  program: "interest",
  kind: "kind",
  type: "kind",
  message: "message",
  notes: "message",
};

// Normalize one raw sheet row's keys case-insensitively to the canonical fields.
function normalizeImportRow(raw: Record<string, unknown>): ImportRow {
  const out: ImportRow = {};
  for (const [key, value] of Object.entries(raw)) {
    const canonical = HEADER_ALIASES[key.trim().toLowerCase()];
    if (!canonical) continue;
    const str = value === null || value === undefined ? "" : String(value).trim();
    if (str) out[canonical] = str;
  }
  return out;
}

// A row contributes nothing if it has neither name parts, email, nor phone.
function importRowName(r: ImportRow): string {
  return r.name || `${r.firstName || ""} ${r.lastName || ""}`.trim();
}

// "fitnessGoal" → "Fitness Goal", "dob" → "Dob", "preferred_time" → "Preferred Time"
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Render a captured detail value as a clean string; arrays comma-joined.
function formatDetailValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((v) => formatDetailValue(v))
      .filter((s) => s.length > 0)
      .join(", ");
  }
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

// Flatten captured details into displayable [key, value] pairs, skipping empties.
function detailEntries(details?: Record<string, unknown> | null): [string, string][] {
  if (!details || typeof details !== "object") return [];
  return Object.entries(details).reduce<[string, string][]>((acc, [key, raw]) => {
    const formatted = formatDetailValue(raw);
    if (formatted) acc.push([key, formatted]);
    return acc;
  }, []);
}

// ─── New-enquiry form state ──────────────────────────────────────────────────────

interface NewEnquiryForm {
  name: string;
  email: string;
  phone: string;
  message: string;
  preferredLanguage: string;
  city: string;
  // academy
  enquiringFor: string;
  playerName: string;
  playerAge: string;
  playerGender: string;
  currentLevel: string;
  preferredProgram: string;
  preferredProgramOther: string;
  goal: string;
  goalOther: string;
  // leisure
  gender: string;
  interestedIn: string;
  interestedInOther: string;
  membershipType: string;
  fitnessGoal: string;
  fitnessGoalOther: string;
  experience: string;
  preferredTime: string;
}

const EMPTY_FORM: NewEnquiryForm = {
  name: "",
  email: "",
  phone: "",
  message: "",
  preferredLanguage: "",
  city: "",
  enquiringFor: "",
  playerName: "",
  playerAge: "",
  playerGender: "",
  currentLevel: "",
  preferredProgram: "",
  preferredProgramOther: "",
  goal: "",
  goalOther: "",
  gender: "",
  interestedIn: "",
  interestedInOther: "",
  membershipType: "",
  fitnessGoal: "",
  fitnessGoalOther: "",
  experience: "",
  preferredTime: "",
};

// Resolve an "Other"-style select into the stored value (typed value, not "Other").
function resolveOther(choice: string, other: string): string {
  if (choice === OTHER) return other.trim();
  return choice;
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function EnquiriesPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const canEdit = can("enquiries:edit");

  const LIMIT = 20;
  const [status, setStatus] = useState<EnquiryStatus>("NEW");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCount, setNewCount] = useState<number | null>(null);

  const [converting, setConverting] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<Enquiry | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Detail dialog — the enquiry currently being viewed.
  const [viewing, setViewing] = useState<Enquiry | null>(null);

  // Add-enquiry dialog.
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<EnquiryKind>("academy");
  const [form, setForm] = useState<NewEnquiryForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Import (CSV / XLSX) — preview dialog + commit.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [importing, setImporting] = useState(false);

  const setField = useCallback(
    (key: keyof NewEnquiryForm, value: string) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.crm.enquiries({ status, q: debouncedQ || undefined, page, limit: LIMIT });
      const list: Enquiry[] = Array.isArray(res) ? res : res?.data ?? [];
      setItems(list);
      setTotal(typeof res?.total === "number" ? res.total : list.length);
      setExpanded(new Set());
    } catch (e) {
      const msg = errMsg(e, "Failed to load enquiries");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [status, debouncedQ, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce the search box, and reset to page 1 whenever the filter/search changes.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [status, debouncedQ]);

  // NEW-count badge on the tab — best-effort, never blocks the list.
  const loadNewCount = useCallback(() => {
    api.crm
      .overview()
      .then((o) => setNewCount(typeof o?.newEnquiries === "number" ? o.newEnquiries : null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadNewCount();
  }, [loadNewCount]);

  // ── Actions ────────────────────────────────────────────────────────────────────

  const convert = async (e: Enquiry) => {
    setConverting(e.id);
    try {
      const res = await api.crm.convertEnquiry(e.id);
      const contactId = res?.contactId;
      if (!contactId) throw new Error("No contact was returned");
      toast.success(`${fullName(e)} converted to a contact`);
      router.push(`/crm/${contactId}`);
    } catch (err) {
      toast.error(errMsg(err, "Could not convert this enquiry"));
      setConverting(null);
    }
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    setArchiveBusy(true);
    try {
      await api.crm.updateEnquiry(archiving.id, { status: "ARCHIVED" });
      toast.success("Enquiry archived");
      setArchiving(null);
      setViewing((v) => (v && v.id === archiving.id ? null : v));
      load();
      loadNewCount();
    } catch (err) {
      toast.error(errMsg(err, "Could not archive this enquiry"));
    } finally {
      setArchiveBusy(false);
    }
  };

  // ── Add-enquiry submit ──────────────────────────────────────────────────────────

  const resetAdd = useCallback(() => {
    setForm(EMPTY_FORM);
    setAddKind("academy");
  }, []);

  const submitNewEnquiry = async () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();

    if (!name) {
      toast.error("Please enter a full name");
      return;
    }
    if (!email && !phone) {
      toast.error("Please provide at least an email or a phone number");
      return;
    }

    // Build the captured details + a sensible `interest` summary per kind.
    let interest = "";
    const details: Record<string, unknown> = {
      preferredLanguage: form.preferredLanguage || undefined,
      city: form.city.trim() || undefined,
    };

    if (addKind === "academy") {
      const program = resolveOther(form.preferredProgram, form.preferredProgramOther);
      const goal = resolveOther(form.goal, form.goalOther);
      interest = program || goal || "Academy";
      Object.assign(details, {
        enquiringFor: form.enquiringFor || undefined,
        playerName: form.playerName.trim() || undefined,
        playerAge: form.playerAge.trim() || undefined,
        playerGender: form.playerGender || undefined,
        currentLevel: form.currentLevel || undefined,
        preferredProgram: program || undefined,
        goal: goal || undefined,
      });
    } else {
      const interestedIn = resolveOther(form.interestedIn, form.interestedInOther);
      const fitnessGoal = resolveOther(form.fitnessGoal, form.fitnessGoalOther);
      interest = interestedIn || "Leisure";
      Object.assign(details, {
        gender: form.gender || undefined,
        interestedIn: interestedIn || undefined,
        membershipType: form.membershipType || undefined,
        fitnessGoal: fitnessGoal || undefined,
        experience: form.experience || undefined,
        preferredTime: form.preferredTime || undefined,
      });
    }

    // Drop empty keys so we don't store noise.
    const cleanDetails = Object.fromEntries(
      Object.entries(details).filter(([, v]) => v !== undefined && v !== ""),
    );

    setSubmitting(true);
    try {
      await api.crm.createEnquiry({
        name,
        email,
        phone,
        message: form.message.trim(),
        interest,
        kind: addKind,
        source: "staff",
        details: cleanDetails,
      });
      toast.success("Enquiry added");
      setAddOpen(false);
      resetAdd();
      if (status !== "NEW") setStatus("NEW");
      else load();
      loadNewCount();
    } catch (err) {
      toast.error(errMsg(err, "Could not add this enquiry"));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Import (CSV / XLSX) ──────────────────────────────────────────────────────────

  const downloadTemplate = () => {
    const example = {
      firstName: "Sara",
      lastName: "Al-Otaibi",
      email: "sara@example.com",
      phone: "+966 5x xxx xxxx",
      source: "walk-in",
      interest: "Academy",
      kind: "academy",
      message: "Interested in the junior program",
    };
    const ws = XLSX.utils.json_to_sheet([example], {
      header: ["firstName", "lastName", "email", "phone", "source", "interest", "kind", "message"],
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Enquiries");
    XLSX.writeFile(wb, "enquiries-template.xlsx");
  };

  const onFileSelected = async (file: File | undefined) => {
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheetName = wb.SheetNames[0];
      const sheet = firstSheetName ? wb.Sheets[firstSheetName] : undefined;
      if (!sheet) throw new Error("The file has no sheets");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const rows = raw.map(normalizeImportRow);
      if (rows.length === 0) {
        toast.error("No rows found in that file");
        return;
      }
      setImportRows(rows);
    } catch (err) {
      toast.error(errMsg(err, "Could not read that file"));
    }
  };

  const commitImport = async () => {
    if (!importRows) return;
    setImporting(true);
    try {
      const res = await api.crm.importEnquiries({ rows: importRows });
      toast.success(
        `Imported ${res.created} of ${res.totalRows} (skipped ${res.skipped.length})`,
      );
      if (res.skipped.length) {
        const sample = res.skipped
          .slice(0, 3)
          .map((s) => `row ${s.row}: ${s.reason}`)
          .join("; ");
        const more = res.skipped.length > 3 ? ` …and ${res.skipped.length - 3} more` : "";
        toast.message(`Skipped ${res.skipped.length}`, { description: sample + more });
      }
      setImportRows(null);
      if (status !== "NEW") setStatus("NEW");
      else load();
      loadNewCount();
    } catch (err) {
      toast.error(errMsg(err, "Could not import enquiries"));
    } finally {
      setImporting(false);
    }
  };

  // Details for the currently-viewed enquiry, memoized.
  const viewingEntries = useMemo(
    () => (viewing ? detailEntries(viewing.details) : []),
    [viewing],
  );

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <PermissionGate
      permission="crm:view"
      fallback={
        <EmptyState
          icon={<ClipboardCheck className="h-6 w-6 text-muted-foreground" />}
          title="No access to enquiries"
          description="You don't have permission to view the enquiries inbox."
        />
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Enquiries"
          description="Incoming leads from the website and other channels — convert the good ones into contacts, archive the rest."
          onRefresh={async () => {
            await Promise.all([load(), loadNewCount()]);
          }}
          actions={
            <PermissionGate permission="enquiries:create">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download />
                  Download template
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload />
                  Import
                </Button>
                <Button onClick={() => setAddOpen(true)}>
                  <Plus />
                  Add enquiry
                </Button>
              </div>
            </PermissionGate>
          }
        />

        {/* Hidden file picker for CSV / XLSX import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            void onFileSelected(e.target.files?.[0]);
            // Reset so picking the same file again re-triggers onChange.
            e.target.value = "";
          }}
        />

        {/* Status tabs */}
        <Tabs value={status} onValueChange={(v) => setStatus(v as EnquiryStatus)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {t.value === "NEW" && newCount !== null && newCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {newCount}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, phone or message…"
            className="pl-9"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<Warning className="h-6 w-6 text-destructive" />}
            title="Couldn't load enquiries"
            description={error}
            action={{ label: "Retry", onClick: () => load() }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6 text-muted-foreground" />}
            title={EMPTY_TITLE[status]}
            description={EMPTY_DESC[status]}
          />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Interest</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => {
                  const badge = STATUS_BADGE[e.status];
                  const kindBadge = e.kind ? KIND_BADGE[e.kind] : null;
                  const entries = detailEntries(e.details);
                  const isExpanded = expanded.has(e.id);
                  return (
                    <Fragment key={e.id}>
                    <TableRow>
                      <TableCell className="align-top">
                        <button
                          type="button"
                          onClick={() => setViewing(e)}
                          className="text-left font-medium hover:underline"
                          title="Open enquiry"
                        >
                          {fullName(e)}
                        </button>
                        {entries.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(e.id)}
                            aria-expanded={isExpanded}
                            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-3" />
                            ) : (
                              <ChevronRight className="size-3" />
                            )}
                            {isExpanded ? "Hide details" : "View details"}
                          </button>
                        )}
                        {e.matchedContact && (
                          <Link
                            href={`/crm/${e.matchedContact.id}`}
                            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            title="This enquiry matches an existing contact"
                          >
                            <ArrowRight className="size-3" />
                            matches: {e.matchedContact.name}
                          </Link>
                        )}
                      </TableCell>

                      <TableCell className="align-top">
                        {kindBadge ? (
                          <Badge variant={kindBadge.variant}>{kindBadge.label}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="flex flex-col gap-0.5 text-xs">
                          {e.email && (
                            <a
                              href={`mailto:${e.email}`}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <Mail className="size-3" />
                              {e.email}
                            </a>
                          )}
                          {e.phone && (
                            <a
                              href={`tel:${e.phone}`}
                              className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
                            >
                              <Phone className="size-3" />
                              {e.phone}
                            </a>
                          )}
                          {!e.email && !e.phone && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>

                      <TableCell className="align-top">
                        {e.interest ? (
                          <Badge variant="outline" className="capitalize">
                            {e.interest}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top text-sm text-muted-foreground capitalize">
                        {e.source || "—"}
                      </TableCell>

                      <TableCell className="max-w-[18rem] align-top whitespace-normal text-sm text-muted-foreground">
                        {e.message ? (
                          <span title={e.message}>{truncate(e.message)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top text-sm text-muted-foreground">
                        {formatDate(e.createdAt)}
                      </TableCell>

                      <TableCell className="align-top">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>

                      <TableCell className="align-top text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewing(e)}
                            title="Open enquiry"
                          >
                            <Eye />
                            Open
                          </Button>
                          {e.status === "NEW" && canEdit ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => convert(e)}
                                disabled={converting === e.id}
                              >
                                <UserAdd />
                                {converting === e.id ? "Converting…" : "Convert to contact"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setArchiving(e)}
                                disabled={converting === e.id}
                                title="Archive"
                              >
                                <Archive />
                                Archive
                              </Button>
                            </>
                          ) : e.status === "CONVERTED" && e.contactId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              render={<Link href={`/crm/${e.contactId}`} />}
                            >
                              Open contact
                              <ArrowRight />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>

                    {isExpanded && entries.length > 0 && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={9} className="align-top">
                          <div className="px-1 py-1">
                            <div className="mb-2 text-xs font-medium text-muted-foreground">
                              Captured details
                            </div>
                            <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                              {entries.map(([key, value]) => (
                                <div key={key} className="flex flex-col">
                                  <dt className="text-xs text-muted-foreground">
                                    {humanizeKey(key)}
                                  </dt>
                                  <dd className="text-sm break-words">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {!error && total > LIMIT && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
            </span>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <span>
                Page {page} of {Math.max(1, Math.ceil(total / LIMIT))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(total / LIMIT) || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Enquiry detail dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-2xl">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {fullName(viewing)}
                  {viewing.kind && (
                    <Badge variant={KIND_BADGE[viewing.kind].variant}>
                      {KIND_BADGE[viewing.kind].label}
                    </Badge>
                  )}
                  <Badge variant={STATUS_BADGE[viewing.status].variant}>
                    {STATUS_BADGE[viewing.status].label}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Received {formatDate(viewing.createdAt)}
                  {viewing.handledAt ? ` · handled ${formatDate(viewing.handledAt)}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
                {/* Contact + meta */}
                <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Email</span>
                    {viewing.email ? (
                      <a
                        href={`mailto:${viewing.email}`}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Mail className="size-3" />
                        {viewing.email}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Phone</span>
                    {viewing.phone ? (
                      <a
                        href={`tel:${viewing.phone}`}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Phone className="size-3" />
                        {viewing.phone}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Interest</span>
                    <span className="text-sm capitalize">{viewing.interest || "—"}</span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Source</span>
                    <span className="text-sm capitalize">{viewing.source || "—"}</span>
                  </div>
                </div>

                {/* Linked contact */}
                {(viewing.matchedContact || (viewing.status === "CONVERTED" && viewing.contactId)) && (
                  <div className="flex flex-col gap-1">
                    {viewing.status === "CONVERTED" && viewing.contactId ? (
                      <Link
                        href={`/crm/${viewing.contactId}`}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <ArrowRight className="size-3" />
                        View converted contact
                      </Link>
                    ) : viewing.matchedContact ? (
                      <Link
                        href={`/crm/${viewing.matchedContact.id}`}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        title="This enquiry matches an existing contact"
                      >
                        <ArrowRight className="size-3" />
                        Matches existing contact: {viewing.matchedContact.name}
                      </Link>
                    ) : null}
                  </div>
                )}

                {/* Message */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Message</span>
                  {viewing.message ? (
                    <p className="text-sm whitespace-pre-wrap break-words">{viewing.message}</p>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>

                {/* Captured details */}
                {viewingEntries.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Captured details
                    </span>
                    <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                      {viewingEntries.map(([key, value]) => (
                        <div key={key} className="flex flex-col">
                          <dt className="text-xs text-muted-foreground">{humanizeKey(key)}</dt>
                          <dd className="text-sm break-words">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>

              <DialogFooter showCloseButton>
                {viewing.status === "NEW" && canEdit ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setArchiving(viewing)}
                    >
                      <Archive />
                      Archive
                    </Button>
                    <Button
                      onClick={() => convert(viewing)}
                      disabled={converting === viewing.id}
                    >
                      <UserAdd />
                      {converting === viewing.id ? "Converting…" : "Convert to contact"}
                    </Button>
                  </>
                ) : viewing.status === "CONVERTED" && viewing.contactId ? (
                  <Button render={<Link href={`/crm/${viewing.contactId}`} />}>
                    Open contact
                    <ArrowRight />
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Import preview dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={!!importRows}
        onOpenChange={(o) => {
          if (!o && !importing) setImportRows(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import enquiries</DialogTitle>
            <DialogDescription>
              {importRows
                ? `${importRows.length} row${importRows.length === 1 ? "" : "s"} parsed. Preview of the first ${Math.min(10, importRows.length)} below.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {importRows && (
            <>
              <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importRows.slice(0, 10).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {importRowName(r) || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.email || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.phone || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.source || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <p className="text-xs text-muted-foreground">
                Rows missing both email &amp; phone, or duplicates, will be skipped.
              </p>
            </>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportRows(null)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button onClick={commitImport} disabled={importing || !importRows}>
              {importing
                ? "Importing…"
                : `Import ${importRows?.length ?? 0} row${(importRows?.length ?? 0) === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add-enquiry dialog ────────────────────────────────────────────────── */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) resetAdd();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New enquiry</DialogTitle>
            <DialogDescription>
              Log a walk-in or phone enquiry. It will appear under the New tab.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            {/* Type toggle */}
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <div className="inline-flex w-fit rounded-md border p-0.5">
                {(["academy", "leisure"] as EnquiryKind[]).map((k) => (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant={addKind === k ? "default" : "ghost"}
                    onClick={() => setAddKind(k)}
                  >
                    {KIND_BADGE[k].label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Common fields */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="enq-name">Full name *</Label>
                <Input
                  id="enq-name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="e.g. Sara Al-Otaibi"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="enq-email">Email</Label>
                <Input
                  id="enq-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="name@example.com"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="enq-phone">Phone</Label>
                <Input
                  id="enq-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="+966 5x xxx xxxx"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Preferred language</Label>
                <Select
                  value={form.preferredLanguage || null}
                  onValueChange={(v) => setField("preferredLanguage", v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="enq-city">City</Label>
                <Input
                  id="enq-city"
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  placeholder="e.g. Riyadh"
                />
              </div>
            </div>

            {/* Academy fields */}
            {addKind === "academy" && (
              <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Enquiring for</Label>
                  <Select
                    value={form.enquiringFor || null}
                    onValueChange={(v) => setField("enquiringFor", v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {ENQUIRING_FOR.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="enq-player-name">Player name</Label>
                  <Input
                    id="enq-player-name"
                    value={form.playerName}
                    onChange={(e) => setField("playerName", e.target.value)}
                    placeholder="Player's name"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="enq-player-age">Player age</Label>
                  <Input
                    id="enq-player-age"
                    type="number"
                    min={0}
                    value={form.playerAge}
                    onChange={(e) => setField("playerAge", e.target.value)}
                    placeholder="e.g. 10"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Player gender</Label>
                  <Select
                    value={form.playerGender || null}
                    onValueChange={(v) => setField("playerGender", v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Current level</Label>
                  <Select
                    value={form.currentLevel || null}
                    onValueChange={(v) => setField("currentLevel", v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACADEMY_LEVELS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Preferred program</Label>
                  <Select
                    value={form.preferredProgram || null}
                    onValueChange={(v) => setField("preferredProgram", v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACADEMY_PROGRAMS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.preferredProgram === OTHER && (
                    <Input
                      className="mt-1"
                      value={form.preferredProgramOther}
                      onChange={(e) => setField("preferredProgramOther", e.target.value)}
                      placeholder="Which program?"
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Goal</Label>
                  <Select
                    value={form.goal || null}
                    onValueChange={(v) => setField("goal", v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACADEMY_GOALS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.goal === OTHER && (
                    <Input
                      className="mt-1"
                      value={form.goalOther}
                      onChange={(e) => setField("goalOther", e.target.value)}
                      placeholder="What's the goal?"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Leisure fields */}
            {addKind === "leisure" && (
              <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Gender</Label>
                  <Select
                    value={form.gender || null}
                    onValueChange={(v) => setField("gender", v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Interested in</Label>
                  <Select
                    value={form.interestedIn || null}
                    onValueChange={(v) => setField("interestedIn", v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEISURE_INTERESTS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.interestedIn === OTHER && (
                    <Input
                      className="mt-1"
                      value={form.interestedInOther}
                      onChange={(e) => setField("interestedInOther", e.target.value)}
                      placeholder="Interested in what?"
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Membership type</Label>
                  <Select
                    value={form.membershipType || null}
                    onValueChange={(v) => setField("membershipType", v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEISURE_MEMBERSHIPS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Fitness goal</Label>
                  <Select
                    value={form.fitnessGoal || null}
                    onValueChange={(v) => setField("fitnessGoal", v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEISURE_GOALS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.fitnessGoal === OTHER && (
                    <Input
                      className="mt-1"
                      value={form.fitnessGoalOther}
                      onChange={(e) => setField("fitnessGoalOther", e.target.value)}
                      placeholder="What's the goal?"
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Experience</Label>
                  <Select
                    value={form.experience || null}
                    onValueChange={(v) => setField("experience", v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEISURE_EXPERIENCE.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Preferred time</Label>
                  <Select
                    value={form.preferredTime || null}
                    onValueChange={(v) => setField("preferredTime", v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEISURE_TIMES.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Notes / message */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="enq-message">Notes / message</Label>
              <Textarea
                id="enq-message"
                value={form.message}
                onChange={(e) => setField("message", e.target.value)}
                placeholder="Anything else worth capturing…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                resetAdd();
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={submitNewEnquiry} disabled={submitting}>
              {submitting ? "Adding…" : "Add enquiry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title="Archive enquiry?"
        description={
          archiving
            ? `"${fullName(archiving)}" will be moved to the Archived tab. You can still view it there.`
            : ""
        }
        confirmLabel="Archive"
        loading={archiveBusy}
        onConfirm={confirmArchive}
      />
    </PermissionGate>
  );
}
