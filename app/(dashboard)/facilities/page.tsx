"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  Plus,
  Edit,
  Trash,
  MapPin,
  Clock,
  Users as UsersIcon,
  Tag,
  Close,
} from "@/lib/icons";

// ─── Domain constants ─────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "pitch", label: "Pitch (football)" },
  { value: "padel", label: "Padel court" },
  { value: "swim", label: "Swimming pool" },
  { value: "gym", label: "Gym" },
  { value: "rooftop", label: "Rooftop / hire" },
  { value: "studio", label: "Studio" },
  { value: "other", label: "Other" },
] as const;

const GENDER_RULES = [
  { value: "ANY", label: "Mixed (anyone can book)" },
  { value: "MALE_ONLY", label: "Male only" },
  { value: "FEMALE_ONLY", label: "Female only" },
] as const;

const GENDER_LABEL: Record<string, string> = {
  ANY: "Mixed",
  MALE_ONLY: "Male only",
  FEMALE_ONLY: "Female only",
};

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function formatSAR(amount: number | string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface SlotVariant {
  duration: number | string;
  label?: string;
  price?: number | string | null;
}

interface Facility {
  id: string;
  name: string;
  slug: string;
  category: string;
  description?: string | null;
  image?: string | null;
  bookable: boolean;
  isActive: boolean;
  slotDuration?: number;
  slotVariants?: SlotVariant[];
  capacity?: number;
  pricePerSlot?: number | null;
  currency?: string;
  openTime?: string;
  closeTime?: string;
  genderRule?: string;
  order?: number;
  _count?: { bookings?: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FacilitiesPage() {
  const [items, setItems] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // null = closed, "new" = create form, Facility = edit form
  const [editing, setEditing] = useState<Facility | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Facility | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.facilities.list();
      const rows: Facility[] = Array.isArray(res) ? res : (res?.data ?? []);
      setItems(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load facilities";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.facilities.delete(toDelete.id);
      toast.success(`Deleted "${toDelete.name}"`);
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete facility");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PermissionGate
      permission="facilities:manage"
      fallback={
        <EmptyState
          icon={<MapPin className="h-6 w-6 text-muted-foreground" />}
          title="No access"
          description="You don't have permission to manage facilities."
        />
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Facilities"
          description="The bookable units across Vision7 — pitches, courts, the pool, the gym, the rooftop. These appear in the public booking widget and on the bookings calendar."
          actions={
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              New facility
            </Button>
          }
        />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-5">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<MapPin className="h-6 w-6 text-muted-foreground" />}
          title="Could not load facilities"
          description={error}
          action={{ label: "Retry", onClick: () => load() }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-6 w-6 text-muted-foreground" />}
          title="No facilities configured yet"
          description="Add the bookable units that appear in the public booking widget and on the bookings calendar."
          action={{ label: "Add the first one", onClick: () => setEditing("new") }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((f) => (
            <FacilityCard
              key={f.id}
              facility={f}
              onEdit={() => setEditing(f)}
              onDelete={() => setToDelete(f)}
            />
          ))}
        </div>
      )}

      {editing && (
        <FacilityFormDialog
          facility={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete facility"
        description={
          toDelete
            ? `Delete "${toDelete.name}"? This will also delete every booking linked to it.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={confirmDelete}
      />
      </div>
    </PermissionGate>
  );
}

// ─── Facility card ─────────────────────────────────────────────────────────────

function FacilityCard({
  facility: f,
  onEdit,
  onDelete,
}: {
  facility: Facility;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const bookings = f._count?.bookings ?? 0;
  return (
    <Card className={f.isActive ? "" : "opacity-60"}>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold">{f.name}</h3>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{f.slug}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="gap-1">
                <Tag className="size-3" />
                {categoryLabel(f.category)}
              </Badge>
              {f.genderRule && f.genderRule !== "ANY" && (
                <Badge variant="secondary">{GENDER_LABEL[f.genderRule] ?? f.genderRule}</Badge>
              )}
              {!f.isActive && <Badge variant="destructive">Inactive</Badge>}
              {!f.bookable && <Badge variant="secondary">Not bookable</Badge>}
            </div>
          </div>
        </div>

        {f.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{f.description}</p>
        )}

        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat icon={<Clock className="size-3.5" />} label="Hours" value={`${f.openTime ?? "—"}–${f.closeTime ?? "—"}`} />
          <Stat icon={<UsersIcon className="size-3.5" />} label="Capacity" value={String(f.capacity ?? 1)} />
          <Stat
            icon={<Tag className="size-3.5" />}
            label="Per slot"
            value={f.pricePerSlot != null && f.pricePerSlot !== 0 ? formatSAR(f.pricePerSlot) : "Free"}
          />
        </div>

        {f.slotVariants && f.slotVariants.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {f.slotVariants.map((v, i) => (
              <Badge key={i} variant="outline" className="font-normal">
                {v.label || `${v.duration} min`}
                {v.price != null && v.price !== "" ? ` · ${formatSAR(v.price)}` : ""}
              </Badge>
            ))}
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {bookings ? `${bookings} booking${bookings === 1 ? "" : "s"}` : "No bookings"}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${f.name}`}>
              <Edit className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label={`Delete ${f.name}`}>
              <Trash className="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2 text-center">
      <div className="mx-auto mb-1 flex w-fit text-muted-foreground">{icon}</div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

// ─── Form dialog ───────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  slug: string;
  category: string;
  description: string;
  image: string;
  bookable: boolean;
  isActive: boolean;
  slotDuration: number | string;
  slotVariants: SlotVariant[];
  capacity: number | string;
  pricePerSlot: number | string;
  currency: string;
  openTime: string;
  closeTime: string;
  genderRule: string;
  order: number | string;
}

function FacilityFormDialog({
  facility,
  onClose,
  onSaved,
}: {
  facility: Facility | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!facility;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => ({
    name: facility?.name ?? "",
    slug: facility?.slug ?? "",
    category: facility?.category ?? "pitch",
    description: facility?.description ?? "",
    image: facility?.image ?? "",
    bookable: facility?.bookable ?? true,
    isActive: facility?.isActive ?? true,
    slotDuration: facility?.slotDuration ?? 60,
    slotVariants: Array.isArray(facility?.slotVariants) ? facility!.slotVariants! : [],
    capacity: facility?.capacity ?? 1,
    pricePerSlot: facility?.pricePerSlot ?? "",
    currency: facility?.currency ?? "SAR",
    openTime: facility?.openTime ?? "08:00",
    closeTime: facility?.closeTime ?? "22:00",
    genderRule: facility?.genderRule ?? "ANY",
    order: facility?.order ?? 0,
  }));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Auto-slug from name when creating (only if slug untouched).
  useEffect(() => {
    if (!isEdit && form.name && !form.slug) {
      const slug = form.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setForm((f) => ({ ...f, slug }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name]);

  const updateVariant = (index: number, patch: Partial<SlotVariant>) => {
    setForm((f) => {
      const next = [...f.slotVariants];
      next[index] = { ...next[index], ...patch };
      return { ...f, slotVariants: next };
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.category) {
      toast.error("Name and category are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        category: form.category,
        description: form.description.trim() || null,
        image: form.image.trim() || null,
        bookable: !!form.bookable,
        isActive: !!form.isActive,
        slotDuration: Number(form.slotDuration) || 60,
        slotVariants: form.slotVariants
          .filter((v) => Number(v.duration) > 0)
          .map((v) => ({
            duration: Number(v.duration),
            label: v.label || `${v.duration} min`,
            price: v.price !== "" && v.price != null ? Number(v.price) : null,
          })),
        capacity: Number(form.capacity) || 1,
        pricePerSlot: form.pricePerSlot === "" ? null : Number(form.pricePerSlot),
        currency: form.currency,
        openTime: form.openTime,
        closeTime: form.closeTime,
        genderRule: form.genderRule,
        order: Number(form.order) || 0,
      };
      if (isEdit && facility) {
        await api.facilities.update(facility.id, payload);
        toast.success("Facility updated");
      } else {
        await api.facilities.create(payload);
        toast.success("Facility created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save facility");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border p-6">
          <DialogTitle>{isEdit ? "Edit facility" : "New facility"}</DialogTitle>
          <DialogDescription>
            {isEdit ? facility?.name : "Add a bookable unit to the public booking widget."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex max-h-[calc(90vh-9rem)] flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {/* Name / slug / category / order */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Name" htmlFor="fac-name" required>
                <Input
                  id="fac-name"
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Main Pitch"
                />
              </FormField>
              <FormField label="Slug (URL)" htmlFor="fac-slug">
                <Input
                  id="fac-slug"
                  className="font-mono"
                  value={form.slug}
                  onChange={(e) => set("slug", e.target.value)}
                  placeholder="auto"
                />
              </FormField>
              <FormField label="Category" htmlFor="fac-category" required>
                <Select
                  value={form.category}
                  onValueChange={(v) => set("category", String(v))}
                >
                  <SelectTrigger id="fac-category" className="w-full">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Display order" htmlFor="fac-order">
                <Input
                  id="fac-order"
                  type="number"
                  value={form.order}
                  onChange={(e) => set("order", e.target.value)}
                />
              </FormField>
            </div>

            <FormField label="Description" htmlFor="fac-desc">
              <Textarea
                id="fac-desc"
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Short marketing description shown on the public widget"
              />
            </FormField>

            <FormField label="Image URL" htmlFor="fac-image">
              <Input
                id="fac-image"
                value={form.image}
                onChange={(e) => set("image", e.target.value)}
                placeholder="/leisure/padel.png"
              />
            </FormField>

            {/* Hours / slot duration */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField label="Open time" htmlFor="fac-open">
                <Input
                  id="fac-open"
                  type="time"
                  value={form.openTime}
                  onChange={(e) => set("openTime", e.target.value)}
                />
              </FormField>
              <FormField label="Close time" htmlFor="fac-close">
                <Input
                  id="fac-close"
                  type="time"
                  value={form.closeTime}
                  onChange={(e) => set("closeTime", e.target.value)}
                />
              </FormField>
              <FormField label="Slot duration (min)" htmlFor="fac-slotdur">
                <Input
                  id="fac-slotdur"
                  type="number"
                  min={5}
                  step={5}
                  value={form.slotDuration}
                  onChange={(e) => set("slotDuration", e.target.value)}
                />
              </FormField>
            </div>

            {/* Capacity / price / currency */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField label="Capacity" htmlFor="fac-cap">
                <Input
                  id="fac-cap"
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                />
              </FormField>
              <FormField label="Price per slot" htmlFor="fac-price" hint="Blank = free">
                <Input
                  id="fac-price"
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.pricePerSlot}
                  onChange={(e) => set("pricePerSlot", e.target.value)}
                  placeholder="0"
                />
              </FormField>
              <FormField label="Currency" htmlFor="fac-currency">
                <Input
                  id="fac-currency"
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                />
              </FormField>
            </div>

            {/* Gender rule */}
            <FormField
              label="Gender restriction"
              htmlFor="fac-gender"
              hint="The public booking widget will hide / refuse this facility for the wrong gender."
            >
              <Select
                value={form.genderRule}
                onValueChange={(v) => set("genderRule", String(v))}
              >
                <SelectTrigger id="fac-gender" className="w-full">
                  <SelectValue placeholder="Select a rule" />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_RULES.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {/* Slot variants */}
            <div className="space-y-2">
              <div>
                <Label className="text-sm font-medium">Slot duration options</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Leave empty to use the default duration above. Add multiple options (e.g. 60 min /
                  90 min) so the customer can pick.
                </p>
              </div>

              {form.slotVariants.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_1fr_auto] items-center gap-2">
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    placeholder="Minutes"
                    value={v.duration ?? ""}
                    onChange={(e) => updateVariant(i, { duration: e.target.value })}
                  />
                  <Input
                    placeholder='Label (e.g. "1 hour")'
                    value={v.label ?? ""}
                    onChange={(e) => updateVariant(i, { label: e.target.value })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Price"
                    value={v.price ?? ""}
                    onChange={(e) => updateVariant(i, { price: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove slot option"
                    onClick={() =>
                      set(
                        "slotVariants",
                        form.slotVariants.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Close className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  set("slotVariants", [
                    ...form.slotVariants,
                    { duration: "", label: "", price: "" },
                  ])
                }
              >
                <Plus className="size-4" />
                Add slot option
              </Button>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-6 pt-2">
              <ToggleField
                id="fac-active"
                label="Active (visible)"
                checked={form.isActive}
                onChange={(v) => set("isActive", v)}
              />
              <ToggleField
                id="fac-bookable"
                label="Bookable from website"
                checked={form.bookable}
                onChange={(v) => set("bookable", v)}
              />
            </div>
          </div>

          <DialogFooter className="border-t border-border p-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create facility"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Small form helpers ─────────────────────────────────────────────────────────

function FormField({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
    </div>
  );
}
