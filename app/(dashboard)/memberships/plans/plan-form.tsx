"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Close } from "@/lib/icons";
import {
  PLAN_TYPES,
  BILLING_CYCLES,
  type Plan,
} from "./plan-constants";

interface PlanFormState {
  name: string;
  description: string;
  type: string;
  category: string;
  price: string;
  billingCycle: string;
  durationDays: string;
  registrationFee: string;
  features: string[];
  isActive: boolean;
  isPublic: boolean;
  sortOrder: string;
  color: string;
  maxFreezeDays: string;
  requiresAthlete: boolean;
  isFamilyPlan: boolean;
}

function emptyPlan(): PlanFormState {
  return {
    name: "",
    description: "",
    type: "ACADEMY",
    category: "academy",
    price: "",
    billingCycle: "monthly",
    durationDays: "",
    registrationFee: "",
    features: [],
    isActive: true,
    isPublic: true,
    sortOrder: "0",
    color: "",
    maxFreezeDays: "",
    requiresAthlete: true,
    isFamilyPlan: false,
  };
}

function fromPlan(initial: Plan): PlanFormState {
  // Legacy PERSONAL_TRAINING plans surface as Leisure in the two-option
  // selector. The underlying data is only changed if the plan is saved.
  const selectorType =
    (initial.type as string) === "ACADEMY" ? "ACADEMY" : "LEISURE";
  return {
    name: initial.name || "",
    description: initial.description || "",
    type: selectorType,
    category: initial.category || (selectorType === "ACADEMY" ? "academy" : "leisure"),
    price: initial.price != null ? String(initial.price) : "",
    billingCycle: initial.billingCycle || "monthly",
    durationDays: initial.durationDays != null ? String(initial.durationDays) : "",
    registrationFee:
      initial.registrationFee != null ? String(initial.registrationFee) : "",
    features: Array.isArray(initial.features) ? initial.features : [],
    isActive: initial.isActive !== false,
    isPublic: initial.isPublic !== false,
    sortOrder: initial.sortOrder != null ? String(initial.sortOrder) : "0",
    color: initial.color || "",
    maxFreezeDays:
      initial.maxFreezeDays != null ? String(initial.maxFreezeDays) : "",
    requiresAthlete:
      initial.requiresAthlete != null
        ? initial.requiresAthlete
        : selectorType === "ACADEMY",
    isFamilyPlan: !!initial.isFamilyPlan,
  };
}

interface PlanFormProps {
  initial?: Plan;
  editingId?: string;
}

export function PlanForm({ initial, editingId }: PlanFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<PlanFormState>(() =>
    initial ? fromPlan(initial) : emptyPlan(),
  );
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Single Academy/Leisure category selector drives the backend `type` +
  // `category`, and defaults requiresAthlete (still overridable below).
  const selectCategory = (type: string) =>
    setForm((f) => ({
      ...f,
      type,
      category: type === "ACADEMY" ? "academy" : "leisure",
      requiresAthlete: type === "ACADEMY",
    }));

  const addFeature = () => set("features", [...form.features, ""]);
  const updateFeature = (i: number, v: string) => {
    const next = [...form.features];
    next[i] = v;
    set("features", next);
  };
  const removeFeature = (i: number) =>
    set("features", form.features.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        category: form.type === "ACADEMY" ? "academy" : "leisure",
        price: Number(form.price) || 0,
        billingCycle: form.billingCycle,
        durationDays: form.durationDays === "" ? undefined : Number(form.durationDays),
        registrationFee:
          form.registrationFee === "" ? undefined : Number(form.registrationFee),
        features: form.features.map((f) => String(f).trim()).filter(Boolean),
        isActive: form.isActive,
        isPublic: form.isPublic,
        sortOrder: Number(form.sortOrder) || 0,
        color: form.color.trim() || undefined,
        maxFreezeDays:
          form.maxFreezeDays === "" ? null : Number(form.maxFreezeDays),
        requiresAthlete: form.requiresAthlete,
        isFamilyPlan: form.isFamilyPlan,
      };

      if (editingId) {
        await api.plans.update(editingId, payload);
        toast.success("Plan updated");
      } else {
        await api.plans.create(payload);
        toast.success("Plan created");
      }
      router.push("/memberships/plans");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link
          href="/memberships/plans"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to plans
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            {editingId ? form.name || "Edit Plan" : "Create Plan"}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" render={<Link href="/memberships/plans" />}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Plan"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="plan-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="plan-name"
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Academy — Junior Monthly"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-description">Description</Label>
                <Textarea
                  id="plan-description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Short description shown to athletes."
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => selectCategory(v as string)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_TYPES.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Billing cycle</Label>
                  <Select
                    value={form.billingCycle}
                    onValueChange={(v) => set("billingCycle", v as string)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a cycle" />
                    </SelectTrigger>
                    <SelectContent>
                      {BILLING_CYCLES.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="plan-price">
                    Price (SAR) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="plan-price"
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-duration">Duration (days)</Label>
                  <Input
                    id="plan-duration"
                    type="number"
                    min="0"
                    value={form.durationDays}
                    onChange={(e) => set("durationDays", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-regfee">Registration fee (SAR)</Label>
                  <Input
                    id="plan-regfee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.registrationFee}
                    onChange={(e) => set("registrationFee", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Features</CardTitle>
              <CardAction>
                <Button type="button" variant="ghost" size="sm" onClick={addFeature}>
                  <Plus className="h-4 w-4" />
                  Add feature
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {form.features.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No features yet. Add benefits that appear on the plan card.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.features.map((f, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={f}
                        onChange={(e) => updateFeature(i, e.target.value)}
                        placeholder="e.g. 3 sessions per week"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeFeature(i)}
                        aria-label="Remove feature"
                      >
                        <Close className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Visibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="plan-active">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive plans cannot be assigned.
                  </p>
                </div>
                <Switch
                  id="plan-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => set("isActive", v)}
                />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="plan-public">Public</Label>
                  <p className="text-xs text-muted-foreground">
                    Show on the public pricing pages.
                  </p>
                </div>
                <Switch
                  id="plan-public"
                  checked={form.isPublic}
                  onCheckedChange={(v) => set("isPublic", v)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-sort">Sort order</Label>
                <Input
                  id="plan-sort"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => set("sortOrder", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Membership rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="plan-max-freeze">Max freeze days</Label>
                <Input
                  id="plan-max-freeze"
                  type="number"
                  min="0"
                  value={form.maxFreezeDays}
                  onChange={(e) => set("maxFreezeDays", e.target.value)}
                  placeholder="No cap"
                />
                <p className="text-xs text-muted-foreground">
                  Lifetime cap on freeze days per membership. Leave empty for no
                  cap.
                </p>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="plan-requires-athlete">
                    Requires athlete profile
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Academy plans: assigning this plan creates an athlete +
                    platform login.
                  </p>
                </div>
                <Switch
                  id="plan-requires-athlete"
                  checked={form.requiresAthlete}
                  onCheckedChange={(v) => set("requiresAthlete", v)}
                />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="plan-family">Family package</Label>
                  <p className="text-xs text-muted-foreground">
                    Covers more than one person. Only holders of a family plan
                    get the &ldquo;add family member&rdquo; option on the members
                    page, and the members they cover are invoiced at zero
                    because this package already paid for them.
                  </p>
                </div>
                <Switch
                  id="plan-family"
                  checked={form.isFamilyPlan}
                  onCheckedChange={(v) => set("isFamilyPlan", v)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Branding</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="plan-color">Accent color (hex)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="plan-color"
                    value={form.color}
                    onChange={(e) => set("color", e.target.value)}
                    placeholder="#FFCF01"
                    className="flex-1"
                  />
                  {form.color && (
                    <div
                      className="h-9 w-9 shrink-0 rounded-md border border-border"
                      style={{ background: form.color }}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
