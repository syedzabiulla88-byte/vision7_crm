"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Pagination } from "@/components/shared/pagination";
import { PermissionGate } from "@/components/shared/permission-gate";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  MapPin,
  Calendar,
  Clock,
  Mail,
  Phone,
  Plus,
  Eye,
  Trash,
  Check,
  Close,
  UserAdd,
  ArrowRight,
  Warning,
  Search,
} from "@/lib/icons";

// ─── Types (mirror the live backend contract) ────────────────────────────────────

type TourKind = "ACADEMY" | "LEISURE";
type TourStatus = "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

interface TourBooking {
  id: string;
  kind: TourKind;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  partySize: number;
  date: string;
  slot: string;
  status: TourStatus;
  notes?: string | null;
  source?: string | null;
  contactId?: string | null;
  createdAt: string;
}

interface TourSlot {
  id: string;
  time: string;
  capacity: number;
  active: boolean;
  sortOrder?: number;
}

interface AvailabilitySlot {
  time: string;
  capacity: number;
  booked: number;
  remaining: number;
  available: boolean;
}

interface ListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NO_SHOW", label: "No-show" },
];

const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "All types" },
  { value: "ACADEMY", label: "Academy" },
  { value: "LEISURE", label: "Leisure" },
];

const STATUS_BADGE: Record<
  TourStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  CONFIRMED: { label: "Confirmed", variant: "default" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
  NO_SHOW: { label: "No-show", variant: "outline" },
};

const KIND_BADGE: Record<
  TourKind,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  ACADEMY: { label: "Academy", variant: "default" },
  LEISURE: { label: "Leisure", variant: "secondary" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fullName(t: { firstName?: string; lastName?: string }): string {
  return `${t.firstName || ""} ${t.lastName || ""}`.trim() || "(no name)";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** YYYY-MM-DD for <input type="date"> (today in local time). */
function todayInput(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function ToursPage() {
  const [tab, setTab] = useState("bookings");
  const [addOpen, setAddOpen] = useState(false);

  return (
    <PermissionGate
      permission="crm:view"
      fallback={
        <EmptyState
          icon={<MapPin className="h-6 w-6 text-muted-foreground" />}
          title="No access to tours"
          description="You don't have permission to view facility tour bookings."
        />
      }
    >
      <div className="space-y-6">
        <Tabs value={tab} onValueChange={setTab}>
          <PageHeader
            title="Tours"
            description="Facility tour bookings for the academy and leisure side, plus the daily tour schedule visitors can book into."
            actions={
              tab === "bookings" ? (
                <Button onClick={() => setAddOpen(true)}>
                  <Plus />
                  Add tour
                </Button>
              ) : undefined
            }
          />

          <TabsList>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="bookings">
            <BookingsTab addOpen={addOpen} onAddOpenChange={setAddOpen} />
          </TabsContent>

          <TabsContent value="schedule">
            <ScheduleTab />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}

// ─── Bookings tab ────────────────────────────────────────────────────────────────

function BookingsTab({
  addOpen,
  onAddOpenChange,
}: {
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
}) {
  const [items, setItems] = useState<TourBooking[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<{ total: number; upcoming: number } | null>(null);

  // Filters
  const [status, setStatus] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Row action state
  const [busyId, setBusyId] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const [viewing, setViewing] = useState<TourBooking | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TourBooking | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Debounce the search box (~300ms).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { page, limit: PAGE_SIZE };
      if (status !== "ALL") params.status = status;
      if (kind !== "ALL") params.kind = kind;
      if (from) params.from = from;
      if (to) params.to = to;
      const term = debouncedSearch.trim();
      if (term) params.search = term;

      const res = await api.tours.list(params);
      const list: TourBooking[] = Array.isArray(res) ? res : res?.data ?? [];
      setItems(list);
      setMeta(Array.isArray(res) ? null : res?.meta ?? null);
    } catch (e) {
      const msg = errMsg(e, "Failed to load tour bookings");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, status, kind, from, to, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const loadOverview = useCallback(() => {
    api.tours
      .overview()
      .then((o) =>
        setOverview({
          total: Number(o?.total) || 0,
          upcoming: Number(o?.upcoming) || 0,
        }),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Re-query keeping current filters + refresh the stat cards.
  const reload = useCallback(() => {
    load();
    loadOverview();
  }, [load, loadOverview]);

  // ── Actions ────────────────────────────────────────────────────────────────────

  const setStatusFor = async (t: TourBooking, next: TourStatus, label: string) => {
    setBusyId(t.id);
    try {
      await api.tours.update(t.id, { status: next });
      toast.success(label);
      setViewing((v) => (v && v.id === t.id ? { ...v, status: next } : v));
      reload();
    } catch (e) {
      toast.error(errMsg(e, "Could not update this tour"));
    } finally {
      setBusyId(null);
    }
  };

  const convert = async (t: TourBooking) => {
    setConverting(t.id);
    try {
      const res = await api.tours.convert(t.id);
      const contactId = res?.contact?.id;
      if (res?.createdNew) toast.success(`${fullName(t)} added as a new contact`);
      else toast.success(`${fullName(t)} linked to an existing contact`);
      if (contactId) {
        // Reflect the new link so the row shows "View contact".
        setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, contactId } : x)));
        setViewing((v) => (v && v.id === t.id ? { ...v, contactId } : v));
      }
      loadOverview();
    } catch (e) {
      toast.error(errMsg(e, "Could not convert this tour"));
    } finally {
      setConverting(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.tours.remove(deleteTarget.id);
      toast.success("Tour booking deleted");
      setViewing((v) => (v && v.id === deleteTarget.id ? null : v));
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e, "Could not delete this tour"));
    } finally {
      setDeleteBusy(false);
    }
  };

  const hasFilters =
    status !== "ALL" || kind !== "ALL" || !!from || !!to || !!debouncedSearch.trim();

  return (
    <div className="space-y-6 pt-4">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Total tours"
          value={overview ? overview.total.toLocaleString() : "—"}
          hint="All time"
          icon={<MapPin className="h-5 w-5" />}
        />
        <StatCard
          label="Upcoming"
          value={overview ? overview.upcoming.toLocaleString() : "—"}
          hint="Confirmed, today onward"
          icon={<Calendar className="h-5 w-5" />}
          hue="emerald"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => { setStatus(v ?? "ALL"); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={kind} onValueChange={(v) => { setKind(v ?? "ALL"); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              {KIND_FILTERS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tour-from" className="text-xs">From</Label>
          <Input
            id="tour-from"
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tour-to" className="text-xs">To</Label>
          <Input
            id="tour-to"
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="w-40"
          />
        </div>

        <div className="relative md:ml-auto md:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or phone"
            className="pl-9"
            aria-label="Search tours"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<Warning className="h-6 w-6 text-destructive" />}
          title="Couldn't load tours"
          description={error}
          action={{ label: "Retry", onClick: () => load() }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-6 w-6 text-muted-foreground" />}
          title={hasFilters ? "No tours match your filters" : "No tour bookings yet"}
          description={
            hasFilters
              ? "Try clearing a filter or widening the date range."
              : "Tour bookings from the website and walk-ins will show up here."
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visitor</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => {
                const badge = STATUS_BADGE[t.status];
                const kindBadge = KIND_BADGE[t.kind];
                const rowBusy = busyId === t.id;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="align-top">
                      <button
                        type="button"
                        onClick={() => setViewing(t)}
                        className="text-left font-medium hover:underline"
                        title="Open tour"
                      >
                        {fullName(t)}
                      </button>
                      <div className="mt-1">
                        {kindBadge && (
                          <Badge variant={kindBadge.variant}>{kindBadge.label}</Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="align-top">
                      <div className="flex flex-col gap-0.5 text-xs">
                        {t.phone && (
                          <a
                            href={`tel:${t.phone}`}
                            className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
                          >
                            <Phone className="size-3" />
                            {t.phone}
                          </a>
                        )}
                        {t.email && (
                          <a
                            href={`mailto:${t.email}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Mail className="size-3" />
                            {t.email}
                          </a>
                        )}
                        {!t.phone && !t.email && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="align-top text-sm">
                      <div className="flex flex-col">
                        <span>{formatDate(t.date)}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {t.slot || "—"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="align-top text-sm tabular-nums">
                      {t.partySize ?? 1}
                    </TableCell>

                    <TableCell className="align-top">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>

                    <TableCell className="align-top text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewing(t)}
                          title="Open tour"
                        >
                          <Eye />
                          Open
                        </Button>

                        {t.status === "CONFIRMED" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setStatusFor(t, "COMPLETED", "Marked completed")}
                              disabled={rowBusy}
                              title="Mark completed"
                            >
                              <Check />
                              Completed
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setStatusFor(t, "NO_SHOW", "Marked as no-show")}
                              disabled={rowBusy}
                              title="Mark as no-show"
                            >
                              No-show
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setStatusFor(t, "CANCELLED", "Tour cancelled")}
                              disabled={rowBusy}
                              title="Cancel tour"
                            >
                              <Close />
                              Cancel
                            </Button>
                          </>
                        )}

                        {t.contactId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            render={<Link href={`/crm/${t.contactId}`} />}
                            title="View linked contact"
                          >
                            View contact
                            <ArrowRight />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => convert(t)}
                            disabled={converting === t.id}
                            title="Convert to contact"
                          >
                            <UserAdd />
                            {converting === t.id ? "Converting…" : "Convert"}
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteTarget(t)}
                          title="Delete tour"
                          aria-label="Delete tour"
                        >
                          <Trash />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        page={page}
        pageSize={meta?.limit ?? PAGE_SIZE}
        total={meta?.total ?? items.length}
        totalPages={meta?.totalPages ?? 1}
        onPageChange={setPage}
      />

      {/* Detail drawer */}
      <TourDetailDialog
        tour={viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        busy={viewing ? busyId === viewing.id : false}
        converting={viewing ? converting === viewing.id : false}
        onSetStatus={(next, label) => viewing && setStatusFor(viewing, next, label)}
        onConvert={() => viewing && convert(viewing)}
        onDelete={() => viewing && setDeleteTarget(viewing)}
      />

      {/* Add-tour dialog */}
      {addOpen && (
        <AddTourDialog
          onClose={() => onAddOpenChange(false)}
          onCreated={() => {
            onAddOpenChange(false);
            reload();
          }}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete tour booking"
        description={
          deleteTarget
            ? `Delete the tour for ${fullName(deleteTarget)}? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteBusy}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

// ─── Tour detail dialog ──────────────────────────────────────────────────────────

function TourDetailDialog({
  tour,
  onOpenChange,
  busy,
  converting,
  onSetStatus,
  onConvert,
  onDelete,
}: {
  tour: TourBooking | null;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  converting: boolean;
  onSetStatus: (next: TourStatus, label: string) => void;
  onConvert: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog open={!!tour} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {tour && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {fullName(tour)}
                <Badge variant={KIND_BADGE[tour.kind].variant}>
                  {KIND_BADGE[tour.kind].label}
                </Badge>
                <Badge variant={STATUS_BADGE[tour.status].variant}>
                  {STATUS_BADGE[tour.status].label}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                Booked {formatDate(tour.createdAt)}
                {tour.source ? ` · via ${tour.source}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <span className="text-sm">{formatDate(tour.date)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Slot</span>
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Clock className="size-3" />
                    {tour.slot || "—"}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Party size</span>
                  <span className="text-sm tabular-nums">{tour.partySize ?? 1}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Phone</span>
                  {tour.phone ? (
                    <a
                      href={`tel:${tour.phone}`}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Phone className="size-3" />
                      {tour.phone}
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Email</span>
                  {tour.email ? (
                    <a
                      href={`mailto:${tour.email}`}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Mail className="size-3" />
                      {tour.email}
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </div>

              {tour.contactId && (
                <Link
                  href={`/crm/${tour.contactId}`}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ArrowRight className="size-3" />
                  View linked contact
                </Link>
              )}

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Notes</span>
                {tour.notes ? (
                  <p className="text-sm whitespace-pre-wrap break-words">{tour.notes}</p>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
            </div>

            <DialogFooter showCloseButton>
              <Button
                variant="destructive"
                onClick={onDelete}
                title="Delete tour"
              >
                <Trash />
                Delete
              </Button>
              {!tour.contactId && (
                <Button onClick={onConvert} disabled={converting}>
                  <UserAdd />
                  {converting ? "Converting…" : "Convert to contact"}
                </Button>
              )}
              {tour.status === "CONFIRMED" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => onSetStatus("NO_SHOW", "Marked as no-show")}
                    disabled={busy}
                  >
                    No-show
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onSetStatus("CANCELLED", "Tour cancelled")}
                    disabled={busy}
                  >
                    <Close />
                    Cancel
                  </Button>
                  <Button
                    onClick={() => onSetStatus("COMPLETED", "Marked completed")}
                    disabled={busy}
                  >
                    <Check />
                    Mark completed
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Add-tour dialog ─────────────────────────────────────────────────────────────

interface NewTourForm {
  kind: TourKind;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  partySize: string;
  date: string;
  slot: string;
  notes: string;
}

function AddTourDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<NewTourForm>({
    kind: "ACADEMY",
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    partySize: "1",
    date: "",
    slot: "",
    notes: "",
  });
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof NewTourForm>(k: K, v: NewTourForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Load availability whenever the date changes; reset the chosen slot.
  useEffect(() => {
    if (!form.date) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setForm((f) => ({ ...f, slot: "" }));
    api.tours
      .availability(form.date)
      .then((res) => {
        if (cancelled) return;
        const list: AvailabilitySlot[] = Array.isArray(res?.slots) ? res.slots : [];
        setSlots(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setSlots([]);
        toast.error(errMsg(e, "Could not load availability"));
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.date]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    if (!form.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    if (!form.date) {
      toast.error("Pick a date");
      return;
    }
    if (!form.slot) {
      toast.error("Pick a time slot");
      return;
    }

    setSaving(true);
    try {
      await api.tours.create({
        kind: form.kind,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim(),
        partySize: Math.max(1, Number(form.partySize) || 1),
        date: form.date,
        slot: form.slot,
        notes: form.notes.trim() || undefined,
      });
      toast.success("Tour booked");
      onCreated();
    } catch (err) {
      toast.error(errMsg(err, "Could not book this tour"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New tour</DialogTitle>
            <DialogDescription>
              Book a facility tour for a visitor. Phone is required so the team can confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-4 overflow-y-auto py-4 pr-1">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", (v as TourKind) ?? "ACADEMY")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACADEMY">Academy</SelectItem>
                  <SelectItem value="LEISURE">Leisure</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tour-first">First name *</Label>
                <Input
                  id="tour-first"
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  placeholder="e.g. Sara"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tour-last">Last name</Label>
                <Input
                  id="tour-last"
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  placeholder="e.g. Al-Otaibi"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tour-phone">Phone *</Label>
                <Input
                  id="tour-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+966 5X XXX XXXX"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tour-email">Email</Label>
                <Input
                  id="tour-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tour-party">Party size</Label>
                <Input
                  id="tour-party"
                  type="number"
                  min={1}
                  value={form.partySize}
                  onChange={(e) => set("partySize", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tour-date">Date *</Label>
                <Input
                  id="tour-date"
                  type="date"
                  min={todayInput()}
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Slot *</Label>
                <Select
                  value={form.slot || null}
                  onValueChange={(v) => set("slot", v ?? "")}
                >
                  <SelectTrigger className="w-full" disabled={!form.date || slotsLoading}>
                    <SelectValue
                      placeholder={
                        !form.date
                          ? "Pick a date first"
                          : slotsLoading
                            ? "Loading…"
                            : slots.length === 0
                              ? "No slots"
                              : "Select slot"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {slots.map((s) => (
                      <SelectItem key={s.time} value={s.time} disabled={s.remaining <= 0}>
                        {s.time} — {s.remaining <= 0 ? "full" : `${s.remaining} left`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Slots show remaining capacity. Admin bookings can still overbook a full slot if needed.
            </p>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tour-notes">Notes</Label>
              <Textarea
                id="tour-notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Anything worth capturing about this visit…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Booking…" : "Book tour"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Schedule tab (config) ───────────────────────────────────────────────────────

function ScheduleTab() {
  const [slots, setSlots] = useState<TourSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-slot row state
  const [newTime, setNewTime] = useState("");
  const [newCapacity, setNewCapacity] = useState("2");
  const [adding, setAdding] = useState(false);

  // Per-row save / edit state
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TourSlot | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Config form
  const [notifyEmail, setNotifyEmail] = useState("");
  const [bookingWindowDays, setBookingWindowDays] = useState("");
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.tours.slots();
      const list: TourSlot[] = Array.isArray(res) ? res : res?.data ?? [];
      list.sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.time || "").localeCompare(b.time || ""),
      );
      setSlots(list);
    } catch (e) {
      const msg = errMsg(e, "Failed to load slots");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const res = await api.tours.getConfig();
      setNotifyEmail(res?.notifyEmail ?? "");
      setBookingWindowDays(
        res?.bookingWindowDays != null ? String(res.bookingWindowDays) : "",
      );
    } catch (e) {
      toast.error(errMsg(e, "Failed to load tour settings"));
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSlots();
    loadConfig();
  }, [loadSlots, loadConfig]);

  const addSlot = async () => {
    const time = newTime.trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      toast.error("Enter a time as HH:MM, e.g. 10:00");
      return;
    }
    const capacity = Math.max(1, Number(newCapacity) || 1);
    setAdding(true);
    try {
      await api.tours.createSlot({ time, capacity, active: true });
      toast.success("Slot added");
      setNewTime("");
      setNewCapacity("2");
      loadSlots();
    } catch (e) {
      toast.error(errMsg(e, "Could not add this slot"));
    } finally {
      setAdding(false);
    }
  };

  const saveCapacity = async (slot: TourSlot, value: string) => {
    const capacity = Math.max(1, Number(value) || 1);
    if (capacity === slot.capacity) return;
    setSavingId(slot.id);
    try {
      await api.tours.updateSlot(slot.id, { capacity });
      setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, capacity } : s)));
      toast.success("Slot updated");
    } catch (e) {
      toast.error(errMsg(e, "Could not update this slot"));
      loadSlots();
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (slot: TourSlot, active: boolean) => {
    setSavingId(slot.id);
    // Optimistic toggle.
    setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, active } : s)));
    try {
      await api.tours.updateSlot(slot.id, { active });
    } catch (e) {
      toast.error(errMsg(e, "Could not update this slot"));
      loadSlots();
    } finally {
      setSavingId(null);
    }
  };

  const confirmDeleteSlot = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.tours.deleteSlot(deleteTarget.id);
      toast.success("Slot removed");
      setDeleteTarget(null);
      loadSlots();
    } catch (e) {
      toast.error(errMsg(e, "Could not remove this slot"));
    } finally {
      setDeleteBusy(false);
    }
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    try {
      await api.tours.updateConfig({
        notifyEmail: notifyEmail.trim(),
        bookingWindowDays: Math.max(0, Number(bookingWindowDays) || 0),
      });
      toast.success("Tour settings saved");
    } catch (err) {
      toast.error(errMsg(err, "Could not save tour settings"));
    } finally {
      setConfigSaving(false);
    }
  };

  return (
    <div className="space-y-8 pt-4">
      {/* Daily slots */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Daily time slots</h2>
          <p className="text-sm text-muted-foreground">
            Slots repeat daily; capacity = how many bookings allowed per slot.
          </p>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Loading slots…
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-destructive">{error}</p>
                      <Button variant="outline" size="sm" onClick={loadSlots}>
                        Retry
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : slots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No slots yet. Add one below to let visitors book a tour.
                  </TableCell>
                </TableRow>
              ) : (
                slots.map((slot) => (
                  <TableRow key={slot.id}>
                    <TableCell className="font-medium tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-3.5 text-muted-foreground" />
                        {slot.time}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        defaultValue={slot.capacity}
                        disabled={savingId === slot.id}
                        onBlur={(e) => saveCapacity(slot, e.target.value)}
                        className="h-8 w-20"
                        aria-label={`Capacity for ${slot.time}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={slot.active}
                        disabled={savingId === slot.id}
                        onCheckedChange={(v) => toggleActive(slot, !!v)}
                        aria-label={`Toggle ${slot.time} active`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        onClick={() => setDeleteTarget(slot)}
                        title="Remove slot"
                        aria-label="Remove slot"
                      >
                        <Trash />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}

              {/* Add-slot row */}
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell>
                  <Input
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    placeholder="HH:MM"
                    className="h-8 w-24"
                    aria-label="New slot time"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(e.target.value)}
                    className="h-8 w-20"
                    aria-label="New slot capacity"
                  />
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">Active on add</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={addSlot} disabled={adding}>
                    <Plus />
                    {adding ? "Adding…" : "Add slot"}
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Tours config */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Tour settings</h2>
          <p className="text-sm text-muted-foreground">
            Where new tour bookings are notified, and how far ahead visitors can book.
          </p>
        </div>

        <Card>
          <CardContent className="p-5">
            <form onSubmit={saveConfig} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tour-notify-email">Notification email</Label>
                  <Input
                    id="tour-notify-email"
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    placeholder="tours@vision7.sa"
                    disabled={configLoading}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tour-window">Booking window (days)</Label>
                  <Input
                    id="tour-window"
                    type="number"
                    min={0}
                    value={bookingWindowDays}
                    onChange={(e) => setBookingWindowDays(e.target.value)}
                    placeholder="e.g. 30"
                    disabled={configLoading}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={configSaving || configLoading}>
                  {configSaving ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* Delete slot confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Remove time slot"
        description={
          deleteTarget
            ? `Remove the ${deleteTarget.time} slot? Visitors will no longer be able to book it.`
            : ""
        }
        confirmLabel="Remove"
        variant="destructive"
        loading={deleteBusy}
        onConfirm={confirmDeleteSlot}
      />
    </div>
  );
}
