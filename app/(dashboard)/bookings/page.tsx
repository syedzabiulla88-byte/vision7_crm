"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PermissionGate } from "@/components/shared/permission-gate";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  Close,
  Clock,
  User,
  Mail,
  Phone,
  Plus,
  MapPin,
  ArrowRight,
} from "@/lib/icons";

// ─── Types ────────────────────────────────────────────────────────────────

type BookingStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
type ViewMode = "day" | "week" | "month";

interface BookingContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

interface BookingFacility {
  id: string;
  name: string;
  slug?: string;
  category?: string;
  image?: string | null;
}

interface Booking {
  id: string;
  facilityId: string;
  facility?: BookingFacility | null;
  contactId?: string | null;
  contact?: BookingContact | null;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus | string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerGender?: string | null;
  partySize?: number | null;
  totalPrice?: number | string | null;
  currency?: string | null;
  notes?: string | null;
}

interface Facility {
  id: string;
  name: string;
  category?: string;
  genderRule?: string;
}

interface Plan {
  id: string;
  name: string;
  category?: string;
  price?: number | string | null;
}

// ─── Static config ───────────────────────────────────────────────────────

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const VIEWS: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const GENDERS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

// Mirrors backend DEFAULT_GENDER_WINDOWS (women 06:00–15:00, men 16:00–01:00).
const GENDER_WINDOW_HINT: Record<string, string> = {
  MALE: "Men's public booking hours: 16:00–01:00.",
  FEMALE: "Women's public booking hours: 06:00–15:00.",
};

// ─── Date helpers ─────────────────────────────────────────────────────────

function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday-start week
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1, 0);
  x.setHours(23, 59, 59, 999);
  return x;
}

// ─── Format helpers ───────────────────────────────────────────────────────

function formatSAR(value: number | string | null | undefined, currency = "SAR"): string {
  const n = Number(value || 0);
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}
function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_BADGE: Record<string, string> = {
  CONFIRMED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  PENDING: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  COMPLETED: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  CANCELLED: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

function statusClasses(s: string | undefined): string {
  return STATUS_BADGE[String(s || "").toUpperCase()] || "border-border bg-muted/40 text-muted-foreground";
}

function StatusBadge({ status }: { status: string | undefined }) {
  return (
    <Badge variant="outline" className={statusClasses(status)}>
      {String(status || "").toUpperCase()}
    </Badge>
  );
}

function asArray<T = any>(res: any): T[] {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  const [selected, setSelected] = useState<Booking | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [facilityFilter, setFacilityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Range based on the active view.
  const range = useMemo(() => {
    if (view === "day") return { from: cursor, to: cursor };
    if (view === "week") {
      const s = startOfWeek(cursor);
      return { from: s, to: addDays(s, 6) };
    }
    return { from: startOfMonth(cursor), to: endOfMonth(cursor) };
  }, [view, cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bkRes, facRes] = await Promise.all([
        api.bookings.list({
          from: fmtISO(range.from),
          to: fmtISO(range.to),
          facilityId: facilityFilter !== "ALL" ? facilityFilter : undefined,
          status: statusFilter !== "ALL" ? statusFilter : undefined,
          limit: 200,
        }),
        api.facilities.list().catch(() => []),
      ]);
      setBookings(asArray<Booking>(bkRes));
      setFacilities(asArray<Facility>(facRes));
    } catch (err: any) {
      const msg = err?.message || "Failed to load bookings";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, facilityFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Membership plans for the optional allocation select — loaded once.
  useEffect(() => {
    let active = true;
    api.plans
      .list()
      .then((res) => {
        if (active) setPlans(asArray<Plan>(res));
      })
      .catch(() => {
        if (active) setPlans([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const navigate = (dir: number) => {
    const next = new Date(cursor);
    if (view === "day") next.setDate(next.getDate() + dir);
    else if (view === "week") next.setDate(next.getDate() + dir * 7);
    else next.setMonth(next.getMonth() + dir);
    next.setHours(0, 0, 0, 0);
    setCursor(next);
  };

  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCursor(d);
  };

  const updateStatus = async (id: string, status: BookingStatus) => {
    try {
      await api.bookings.updateStatus(id, status);
      toast.success(`Booking marked ${status.toLowerCase()}.`);
      setSelected((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update booking status.");
    }
  };

  const createBooking = async (payload: any) => {
    await api.bookings.create(payload);
    setShowCreate(false);
    toast.success("Booking created.");
    await load();
  };

  const rangeLabel = useMemo(() => {
    if (view === "day")
      return cursor.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    if (view === "week") return `${formatDate(range.from)} — ${formatDate(range.to)}`;
    return cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }, [view, cursor, range.from, range.to]);

  const totalRevenue = bookings.reduce((s, b) => s + Number(b.totalPrice || 0), 0);
  const pending = bookings.filter((b) => String(b.status).toUpperCase() === "PENDING").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description="Every pitch, padel court, gym and swim slot booked from the public website and by staff."
        onRefresh={load}
        actions={
          <PermissionGate permission="bookings:manage">
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New Booking
            </Button>
          </PermissionGate>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label={`Previous ${view}`}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={goToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)} aria-label={`Next ${view}`}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-medium text-foreground">{rangeLabel}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="inline-flex rounded-md border border-border p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setView(v.value)}
                className={`rounded-[6px] px-3 py-1 text-xs font-medium transition-colors ${
                  view === v.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <Select
            items={[
              { value: "ALL", label: "All facilities" },
              ...facilities.map((f) => ({ value: f.id, label: f.name })),
            ]}
            value={facilityFilter}
            onValueChange={(v) => setFacilityFilter(v ?? "")}
          >
            <SelectTrigger className="w-44" size="sm">
              <SelectValue placeholder="All facilities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All facilities</SelectItem>
              {facilities.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            items={STATUS_FILTERS}
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v ?? "")}
          >
            <SelectTrigger className="w-40" size="sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={`Bookings this ${view}`}
          value={bookings.length}
          hue="navy"
          icon={<Calendar className="h-6 w-6" />}
        />
        <StatCard label="Potential revenue" value={formatSAR(totalRevenue)} hue="emerald" />
        <StatCard
          label="Pending approval"
          value={pending}
          hue={pending > 0 ? "amber" : "navy"}
        />
      </div>

      {/* Calendar / list */}
      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<Close className="h-6 w-6 text-destructive" />}
          title="Couldn't load bookings"
          description={error}
          action={{ label: "Retry", onClick: () => load() }}
        />
      ) : view === "day" ? (
        <DayView day={cursor} bookings={bookings} onPick={setSelected} />
      ) : view === "week" ? (
        <WeekView weekStart={range.from} bookings={bookings} onPick={setSelected} />
      ) : (
        <MonthView
          monthStart={range.from}
          bookings={bookings}
          onPick={setSelected}
          onJumpToDay={(d) => {
            setCursor(d);
            setView("day");
          }}
        />
      )}

      {/* Detail dialog */}
      <BookingDetailDialog
        booking={selected}
        onClose={() => setSelected(null)}
        onUpdateStatus={updateStatus}
        onDeleted={async () => {
          setSelected(null);
          await load();
        }}
      />

      {/* New booking dialog */}
      {showCreate && (
        <NewBookingDialog
          open={showCreate}
          facilities={facilities}
          plans={plans}
          defaultDate={fmtISO(cursor)}
          onClose={() => setShowCreate(false)}
          onCreate={createBooking}
        />
      )}
    </div>
  );
}

// ─── Day view ───────────────────────────────────────────────────────────

function DayView({
  day,
  bookings,
  onPick,
}: {
  day: Date;
  bookings: Booking[];
  onPick: (b: Booking) => void;
}) {
  const sorted = useMemo(
    () => [...bookings].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [bookings],
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-border">
        <EmptyState
          icon={<Calendar className="h-6 w-6 text-muted-foreground" />}
          title="No bookings on this day"
          description={day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onPick(b)}
          className="grid w-full grid-cols-1 items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40 sm:grid-cols-[130px_1fr_auto_auto]"
        >
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {b.startTime}–{b.endTime}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{b.facility?.name || "—"}</p>
            <p className="truncate text-xs text-muted-foreground">{b.customerName || "—"}</p>
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">
            {Number(b.totalPrice) > 0 ? formatSAR(b.totalPrice, b.currency || "SAR") : "—"}
          </span>
          <StatusBadge status={b.status} />
        </button>
      ))}
    </div>
  );
}

// ─── Week view ──────────────────────────────────────────────────────────

function WeekView({
  weekStart,
  bookings,
  onPick,
}: {
  weekStart: Date;
  bookings: Booking[];
  onPick: (b: Booking) => void;
}) {
  const byDay = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (let i = 0; i < 7; i++) map[fmtISO(addDays(weekStart, i))] = [];
    for (const b of bookings) {
      const key = String(b.date).slice(0, 10);
      (map[key] = map[key] || []).push(b);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [bookings, weekStart]);

  const todayIso = fmtISO(new Date());

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(weekStart, i);
        const key = fmtISO(d);
        const items = byDay[key] || [];
        const isToday = key === todayIso;
        return (
          <div
            key={key}
            className={`flex min-h-[200px] flex-col rounded-lg border bg-card p-2 ${
              isToday ? "border-primary/60" : "border-border"
            }`}
          >
            <div className={`pb-2 text-center ${isToday ? "text-primary" : "text-muted-foreground"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </p>
              <p className="text-lg font-semibold tabular-nums">{d.getDate()}</p>
            </div>
            <Separator />
            <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
              {items.length === 0 ? (
                <p className="mt-3 text-center text-[10px] text-muted-foreground/60">—</p>
              ) : (
                items.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onPick(b)}
                    className={`w-full rounded-md border px-1.5 py-1 text-left transition-colors hover:opacity-90 ${statusClasses(
                      b.status,
                    )}`}
                  >
                    <p className="font-mono text-[10px] tabular-nums">
                      {b.startTime}–{b.endTime}
                    </p>
                    <p className="truncate text-[11px] font-medium">{b.facility?.name || "—"}</p>
                    <p className="truncate text-[10px] opacity-80">{b.customerName || "—"}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Month view ─────────────────────────────────────────────────────────

function MonthView({
  monthStart,
  bookings,
  onPick,
  onJumpToDay,
}: {
  monthStart: Date;
  bookings: Booking[];
  onPick: (b: Booking) => void;
  onJumpToDay: (d: Date) => void;
}) {
  const gridStart = startOfWeek(monthStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthIdx = monthStart.getMonth();
  const todayIso = fmtISO(new Date());

  const byDay = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const b of bookings) {
      const key = String(b.date).slice(0, 10);
      (map[key] = map[key] || []).push(b);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [bookings]);

  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="hidden grid-cols-7 border-b border-border bg-muted/40 sm:grid">
        {dow.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-7">
        {cells.map((d) => {
          const iso = fmtISO(d);
          const items = byDay[iso] || [];
          const inMonth = d.getMonth() === monthIdx;
          const isToday = iso === todayIso;
          // On small screens, only render days that have bookings (avoids a 42-row stack).
          const hiddenOnMobile = items.length === 0 ? "hidden sm:flex" : "flex";
          return (
            <div
              key={iso}
              role="button"
              tabIndex={0}
              onClick={() => onJumpToDay(d)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onJumpToDay(d);
                }
              }}
              className={`${hiddenOnMobile} min-h-[110px] cursor-pointer flex-col border-b border-r border-border p-2 transition-colors hover:bg-muted/30 ${
                inMonth ? "" : "opacity-40"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    isToday
                      ? "rounded bg-primary px-1.5 py-0.5 text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {d.getDate()}
                </span>
                {items.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{items.length}</span>
                )}
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {items.slice(0, 3).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPick(b);
                    }}
                    className={`w-full truncate rounded border px-1 py-0.5 text-left text-[10px] ${statusClasses(
                      b.status,
                    )}`}
                  >
                    {b.startTime} {b.facility?.name || ""}
                  </button>
                ))}
                {items.length > 3 && (
                  <p className="px-1 text-[10px] text-muted-foreground">+{items.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Detail dialog ────────────────────────────────────────────────────────

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

function BookingDetailDialog({
  booking,
  onClose,
  onUpdateStatus,
  onDeleted,
}: {
  booking: Booking | null;
  onClose: () => void;
  onUpdateStatus: (id: string, status: BookingStatus) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const status = String(booking?.status || "").toUpperCase();

  const handleDelete = async () => {
    if (!booking) return;
    setDeleting(true);
    try {
      await api.bookings.delete(booking.id);
      toast.success("Booking deleted.");
      setConfirmDelete(false);
      await onDeleted();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete booking.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          {booking && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  {booking.facility?.name || "Booking"}
                </DialogTitle>
                <DialogDescription className="sr-only">Booking details and status controls.</DialogDescription>
                <div className="pt-1">
                  <StatusBadge status={booking.status} />
                </div>
              </DialogHeader>

              <div className="space-y-3">
                <DetailRow icon={Clock} label="When">
                  {formatDate(booking.date)} · {booking.startTime}–{booking.endTime}
                </DetailRow>
                {booking.facility?.category && (
                  <DetailRow icon={MapPin} label="Facility">
                    {booking.facility.name}
                    <span className="ml-1 text-muted-foreground">({booking.facility.category})</span>
                  </DetailRow>
                )}
                <DetailRow icon={User} label="Customer">
                  {booking.contact ? (
                    <Link
                      href={`/crm/${booking.contact.id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {booking.customerName || "View contact"}
                      <ArrowRight className="ml-1 inline h-3 w-3" />
                    </Link>
                  ) : (
                    booking.customerName || "—"
                  )}
                </DetailRow>
                {booking.customerEmail && (
                  <DetailRow icon={Mail} label="Email">
                    <a href={`mailto:${booking.customerEmail}`} className="hover:text-primary">
                      {booking.customerEmail}
                    </a>
                  </DetailRow>
                )}
                {booking.customerPhone && (
                  <DetailRow icon={Phone} label="Phone">
                    <a href={`tel:${booking.customerPhone}`} className="hover:text-primary">
                      {booking.customerPhone}
                    </a>
                  </DetailRow>
                )}
                {Number(booking.totalPrice) > 0 && (
                  <DetailRow icon={Calendar} label="Price">
                    {formatSAR(booking.totalPrice, booking.currency || "SAR")} ·{" "}
                    {booking.partySize || 1} {(booking.partySize || 1) === 1 ? "person" : "people"}
                  </DetailRow>
                )}
                {booking.notes && (
                  <div className="rounded-md bg-muted/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Notes
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{booking.notes}</p>
                  </div>
                )}
              </div>

              <PermissionGate permission="bookings:manage">
                <Separator />
                <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-start">
                  {status === "PENDING" && (
                    <Button size="sm" onClick={() => onUpdateStatus(booking.id, "CONFIRMED")}>
                      <Check className="h-4 w-4" />
                      Confirm
                    </Button>
                  )}
                  {status === "CONFIRMED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateStatus(booking.id, "COMPLETED")}
                    >
                      <Check className="h-4 w-4" />
                      Mark completed
                    </Button>
                  )}
                  {status !== "CANCELLED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateStatus(booking.id, "CANCELLED")}
                    >
                      <Close className="h-4 w-4" />
                      Cancel
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="sm:ml-auto"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </Button>
                </DialogFooter>
              </PermissionGate>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete booking"
        description="This permanently removes the booking. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}

// ─── New booking dialog ─────────────────────────────────────────────────

interface NewBookingForm {
  facilityId: string;
  date: string;
  startTime: string;
  endTime: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  partySize: string;
  membershipPlanId: string;
  notes: string;
  overrideBlackout: boolean;
}

function NewBookingDialog({
  open,
  facilities,
  plans,
  defaultDate,
  onClose,
  onCreate,
}: {
  open: boolean;
  facilities: Facility[];
  plans: Plan[];
  defaultDate: string;
  onClose: () => void;
  onCreate: (payload: any) => Promise<void>;
}) {
  const [form, setForm] = useState<NewBookingForm>({
    facilityId: "",
    date: defaultDate || fmtISO(new Date()),
    startTime: "",
    endTime: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    gender: "",
    partySize: "1",
    membershipPlanId: "",
    notes: "",
    overrideBlackout: false,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof NewBookingForm>(k: K, v: NewBookingForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.facilityId) {
      setFormError("Please choose a facility.");
      return;
    }
    if (!form.date || !form.startTime || !form.endTime) {
      setFormError("Date, start time and end time are required.");
      return;
    }
    if (form.startTime >= form.endTime) {
      setFormError("Start time must be before end time.");
      return;
    }
    if (!form.firstName.trim()) {
      setFormError("Customer first name is required.");
      return;
    }

    const payload: any = {
      facilityId: form.facilityId,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      gender: form.gender || undefined,
      partySize: Number(form.partySize) || 1,
      notes: form.notes.trim() || undefined,
      membershipPlanId: form.membershipPlanId || undefined,
      overrideBlackout: form.overrideBlackout || undefined,
    };

    setSaving(true);
    try {
      await onCreate(payload);
    } catch (err: any) {
      setFormError(err?.message || "Failed to create booking.");
      setSaving(false);
    }
  };

  const genderHint = form.gender ? GENDER_WINDOW_HINT[form.gender] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>
            Reception desk entry. Admin bookings go straight to confirmed and bypass the public
            gender-time windows.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Facility */}
          <div className="space-y-2">
            <Label htmlFor="nb-facility">
              Facility <span className="text-destructive">*</span>
            </Label>
            <Select
              items={facilities.map((f) => ({ value: f.id, label: f.name }))}
              value={form.facilityId}
              onValueChange={(v) => set("facilityId", v ?? "")}
            >
              <SelectTrigger id="nb-facility" className="w-full">
                <SelectValue placeholder="Select a facility" />
              </SelectTrigger>
              <SelectContent>
                {facilities.length === 0 ? (
                  <SelectItem key="__empty" value="__none" disabled>
                    No facilities
                  </SelectItem>
                ) : (
                  facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                      {f.category ? ` · ${f.category}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Date + times */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="nb-date">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nb-date"
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-start">
                Start <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nb-start"
                type="time"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-end">
                End <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nb-end"
                type="time"
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
                required
              />
            </div>
          </div>
          {genderHint && (
            <p className="-mt-1 text-xs text-muted-foreground">
              {genderHint} Admin bookings are not blocked by these windows.
            </p>
          )}

          {/* Customer */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nb-first">
                First name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nb-first"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-last">Last name</Label>
              <Input id="nb-last" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-email">Email</Label>
              <Input
                id="nb-email"
                type="email"
                placeholder="name@example.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-phone">Phone</Label>
              <Input
                id="nb-phone"
                type="tel"
                placeholder="+966 5X XXX XXXX"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-gender">Gender</Label>
              <Select
                items={GENDERS}
                value={form.gender}
                onValueChange={(v) => set("gender", v ?? "")}
              >
                <SelectTrigger id="nb-gender" className="w-full">
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-party">Party size</Label>
              <Input
                id="nb-party"
                type="number"
                min={1}
                value={form.partySize}
                onChange={(e) => set("partySize", e.target.value)}
              />
            </div>
          </div>

          {/* Optional membership allocation */}
          <div className="space-y-2">
            <Label htmlFor="nb-plan">Allocate membership (optional)</Label>
            <Select
              items={[
                { value: "NONE", label: "No membership" },
                ...plans.map((p) => ({ value: p.id, label: p.name })),
              ]}
              value={form.membershipPlanId || "NONE"}
              onValueChange={(v) => set("membershipPlanId", !v || v === "NONE" ? "" : v)}
            >
              <SelectTrigger id="nb-plan" className="w-full">
                <SelectValue placeholder="No membership" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No membership</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.price != null ? ` · ${formatSAR(p.price)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="nb-notes">Notes</Label>
            <Textarea
              id="nb-notes"
              rows={3}
              placeholder="Anything reception should record…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {/* Override blackout */}
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="pr-3">
              <Label htmlFor="nb-override" className="block">
                Override maintenance blackout
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Allow booking inside an admin-defined facility closure. Double-bookings are always blocked.
              </p>
            </div>
            <Switch
              id="nb-override"
              checked={form.overrideBlackout}
              onCheckedChange={(v: boolean) => set("overrideBlackout", v)}
            />
          </div>

          {formError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {formError}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <Check className="h-4 w-4" />
              {saving ? "Creating…" : "Create booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
