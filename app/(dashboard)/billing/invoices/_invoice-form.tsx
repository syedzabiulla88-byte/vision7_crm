"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Close, Send, Save } from "@/lib/icons";
import { formatSAR, toDateInput, invoiceNo, type Invoice } from "./_shared";

interface LineState {
  /** Selector state: "" = unpicked, "custom" = free text, else a plan id. */
  planId: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

function blankLine(): LineState {
  return { planId: "", description: "", quantity: "1", unitPrice: "0" };
}

function lineFromInvoice(li: { description?: string; quantity?: number; unitPrice?: number }): LineState {
  return {
    planId: "custom",
    description: li.description || "",
    quantity: li.quantity != null ? String(li.quantity) : "1",
    unitPrice: li.unitPrice != null ? String(li.unitPrice) : "0",
  };
}

interface InvoiceFormProps {
  /** When provided, the form edits this (DRAFT) invoice instead of creating one. */
  editing?: Invoice;
}

export function InvoiceForm({ editing }: InvoiceFormProps) {
  const router = useRouter();
  const editingId = editing?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);

  // Recipient: existing Athlete or a walk-in customer.
  const [recipientType, setRecipientType] = useState<"athlete" | "walkin">(
    editing?.customerName ? "walkin" : "athlete",
  );
  const [athleteId, setAthleteId] = useState(editing?.athleteId || "");
  const [membershipId, setMembershipId] = useState(editing?.membershipId || "");
  const [customerName, setCustomerName] = useState(editing?.customerName || "");
  const [customerEmail, setCustomerEmail] = useState(editing?.customerEmail || "");
  const [customerPhone, setCustomerPhone] = useState(editing?.customerPhone || "");
  const [customerAddress, setCustomerAddress] = useState(editing?.customerAddress || "");
  const [issueDate, setIssueDate] = useState(
    editing?.issueDate ? toDateInput(editing.issueDate) : toDateInput(new Date()),
  );
  const [dueDate, setDueDate] = useState(editing?.dueDate ? toDateInput(editing.dueDate) : "");
  const [lineItems, setLineItems] = useState<LineState[]>(() => {
    const src = editing?.lineItems || editing?.items;
    if (Array.isArray(src) && src.length) return src.map(lineFromInvoice);
    return [blankLine()];
  });
  const [taxRate, setTaxRate] = useState(
    editing?.taxRate != null ? String(editing.taxRate) : "0",
  );
  const [discount, setDiscount] = useState(
    editing?.discount != null ? String(editing.discount) : "0",
  );
  const [notes, setNotes] = useState(editing?.notes || "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [aRes, mRes, pRes] = await Promise.all([
          api.athletes.list({ limit: 1000 }),
          api.memberships.list({ limit: 1000 }).catch(() => ({ data: [] })),
          api.plans.list({ limit: 1000 }).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setAthletes(Array.isArray(aRes) ? aRes : aRes?.data || []);
        setMemberships(Array.isArray(mRes) ? mRes : mRes?.data || []);
        setPlans(Array.isArray(pRes) ? pRes : pRes?.data || []);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const athleteMemberships = useMemo(() => {
    if (!athleteId) return memberships;
    return memberships.filter((m) => m.athleteId === athleteId || m.athlete?.id === athleteId);
  }, [athleteId, memberships]);

  // Auto-fill the first line from the selected membership's plan, without
  // clobbering user edits. Only relevant when creating (not editing a draft).
  const autoFilledRef = useRef<{ description: string | null; unitPrice: string | null }>({
    description: null,
    unitPrice: null,
  });
  useEffect(() => {
    if (editingId) return; // don't auto-fill when editing an existing draft
    if (!membershipId) {
      setLineItems((items) => {
        const first = items[0];
        const mark = autoFilledRef.current;
        const stillMatches =
          first &&
          mark.description &&
          first.description === mark.description &&
          first.unitPrice === mark.unitPrice;
        if (!stillMatches) return items;
        autoFilledRef.current = { description: null, unitPrice: null };
        return [blankLine(), ...items.slice(1)];
      });
      return;
    }

    const m = memberships.find((x) => x.id === membershipId);
    const plan = m?.plan;
    if (!plan) return;

    const cycle = plan.billingCycle ? ` (${plan.billingCycle})` : "";
    const description = `Membership — ${plan.name}${cycle}`;
    const unitPrice = String(Number(m.priceAtPurchase ?? plan.price ?? 0) || 0);

    setLineItems((items) => {
      const first = items[0] || blankLine();
      const mark = autoFilledRef.current;
      const firstIsEmpty = !String(first.description || "").trim() && !Number(first.unitPrice);
      const firstIsPrevAuto =
        mark.description &&
        first.description === mark.description &&
        first.unitPrice === mark.unitPrice;
      if (!firstIsEmpty && !firstIsPrevAuto) return items;
      autoFilledRef.current = { description, unitPrice };
      return [{ planId: plan.id, description, quantity: "1", unitPrice }, ...items.slice(1)];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membershipId, memberships, editingId]);

  const subtotal = useMemo(
    () =>
      lineItems.reduce(
        (sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0),
        0,
      ),
    [lineItems],
  );
  const taxAmount = useMemo(
    () => (subtotal * (Number(taxRate) || 0)) / 100,
    [subtotal, taxRate],
  );
  const total = useMemo(
    () => Math.max(subtotal + taxAmount - (Number(discount) || 0), 0),
    [subtotal, taxAmount, discount],
  );

  const updateLine = (i: number, patch: Partial<LineState>) =>
    setLineItems((items) => items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addLine = () => setLineItems((items) => [...items, blankLine()]);
  const removeLine = (i: number) =>
    setLineItems((items) => (items.length > 1 ? items.filter((_, idx) => idx !== i) : items));

  /** Apply a plan-picker selection to a row. */
  const applyPlanToLine = (i: number, value: string) => {
    if (value === "custom") {
      updateLine(i, { planId: "custom" });
      return;
    }
    if (!value) {
      updateLine(i, { planId: "", description: "", unitPrice: "0" });
      return;
    }
    const plan = plans.find((p) => p.id === value);
    if (!plan) return;
    const cycle = plan.billingCycle ? ` (${plan.billingCycle})` : "";
    updateLine(i, {
      planId: plan.id,
      description: `${plan.name}${cycle}`,
      unitPrice: String(Number(plan.price || 0)),
    });
  };

  const buildPayload = () => {
    const base: any = {
      issueDate: issueDate || undefined,
      dueDate: dueDate || undefined,
      items: lineItems
        .filter((li) => (li.description || "").trim())
        .map((li) => ({
          description: String(li.description).trim(),
          quantity: Number(li.quantity) || 0,
          unitPrice: Number(li.unitPrice) || 0,
        })),
      taxRate: Number(taxRate) || 0,
      discount: Number(discount) || 0,
      notes: notes.trim() || undefined,
    };
    if (recipientType === "walkin") {
      return {
        ...base,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
      };
    }
    return { ...base, athleteId, membershipId: membershipId || undefined };
  };

  const save = async ({ send }: { send: boolean }) => {
    if (recipientType === "athlete" && !athleteId) {
      toast.error("Athlete is required");
      return;
    }
    if (recipientType === "walkin" && !customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    const payload = buildPayload();
    if (!payload.items.length) {
      toast.error("At least one line item is required");
      return;
    }
    setSaving(true);
    try {
      let invoiceId = editingId;
      if (editingId) {
        await api.invoices.update(editingId, payload);
      } else {
        const created = await api.invoices.create(payload);
        invoiceId = created?.id;
      }
      if (send && invoiceId) {
        try {
          await api.invoices.send(invoiceId);
        } catch (err) {
          toast.error(`Invoice saved but send failed: ${err instanceof Error ? err.message : err}`);
        }
      }
      toast.success(editingId ? "Invoice updated" : send ? "Invoice saved & sent" : "Invoice saved");
      router.push(`/billing/invoices/${invoiceId || ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  // Plan options, "Custom item" first then plans sorted by name.
  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [plans],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeletons />
      </div>
    );
  }

  const backHref = editingId ? `/billing/invoices/${editingId}` : "/billing/invoices";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {editingId ? "Back to invoice" : "Back to invoices"}
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            {editingId
              ? `Edit ${editing ? invoiceNo(editing) : "Draft Invoice"}`
              : "Create Invoice"}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Recipient */}
          <Card>
            <CardHeader>
              <CardTitle>Recipient</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="inline-flex rounded-md border p-0.5">
                {[
                  { v: "athlete", label: "Academy Athlete" },
                  { v: "walkin", label: "Walk-in Customer" },
                ].map((t) => (
                  <button
                    key={t.v}
                    type="button"
                    onClick={() => setRecipientType(t.v as "athlete" | "walkin")}
                    className={`rounded px-4 py-1.5 text-xs font-medium transition-colors ${
                      recipientType === t.v
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {recipientType === "athlete" ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>
                      Athlete <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={athleteId}
                      onValueChange={(v) => {
                        setAthleteId((v as string) || "");
                        setMembershipId("");
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select athlete…" />
                      </SelectTrigger>
                      <SelectContent>
                        {athletes.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {`${a.firstName || ""} ${a.lastName || ""}`.trim() || "(unnamed)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Membership (optional)</Label>
                    <Select
                      value={membershipId || "none"}
                      onValueChange={(v) => setMembershipId(v === "none" ? "" : (v as string))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {athleteMemberships.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.plan?.name || "—"}
                            {m.startDate
                              ? ` · ${new Date(m.startDate).toLocaleDateString()}`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Use this for customers not in the academy roster — leisure gym, swim pass,
                    one-off sales, etc.
                  </p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="cust-name">
                        Full name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="cust-name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="e.g. Mohammed Al-Saud"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cust-email">Email</Label>
                      <Input
                        id="cust-email"
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="customer@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cust-phone">Phone</Label>
                      <Input
                        id="cust-phone"
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="+966 5X XXX XXXX"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cust-address">Address</Label>
                      <Input
                        id="cust-address"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        placeholder="Street, city"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="issue-date">Issue date</Label>
                  <Input
                    id="issue-date"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due-date">Due date</Label>
                  <Input
                    id="due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line items */}
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lineItems.map((li, i) => {
                const isCustom = li.planId === "custom";
                const rowTotal = (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0);
                return (
                  <div key={i} className="rounded-md border p-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                      <div className="space-y-2 md:col-span-6">
                        <Label className="text-xs text-muted-foreground">Item</Label>
                        <Select
                          value={li.planId || "none"}
                          onValueChange={(v) =>
                            applyPlanToLine(i, v === "none" ? "" : (v as string))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select plan or package…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Select —</SelectItem>
                            <SelectItem value="custom">— Custom item —</SelectItem>
                            {sortedPlans.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                                {p.price != null ? ` · ${formatSAR(p.price)}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isCustom && (
                          <Input
                            value={li.description}
                            onChange={(e) => updateLine(i, { description: e.target.value })}
                            placeholder="Item description"
                          />
                        )}
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label className="text-xs text-muted-foreground">Qty</Label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={li.quantity}
                          onChange={(e) => updateLine(i, { quantity: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label className="text-xs text-muted-foreground">Unit price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={li.unitPrice}
                          onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 md:col-span-2 md:justify-end">
                        <span className="text-sm tabular-nums md:text-right">
                          {formatSAR(rowTotal)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeLine(i)}
                          disabled={lineItems.length === 1}
                          aria-label="Remove line"
                          className="text-destructive hover:text-destructive"
                        >
                          <Close className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4" />
                Add line
              </Button>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes visible to the customer"
              />
            </CardContent>
          </Card>
        </div>

        {/* Side column: adjustments, totals, actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Adjustments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tax-rate">Tax rate (%)</Label>
                <Input
                  id="tax-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount">Discount (SAR)</Label>
                <Input
                  id="discount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatSAR(subtotal)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">{formatSAR(taxAmount)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular-nums">- {formatSAR(Number(discount) || 0)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t pt-3">
                <span className="font-medium">Total</span>
                <span className="text-xl font-semibold tabular-nums">{formatSAR(total)}</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button onClick={() => save({ send: true })} disabled={saving}>
              <Send className="h-4 w-4" />
              {saving ? "Saving…" : editingId ? "Save & Send" : "Save & Send"}
            </Button>
            <Button variant="outline" onClick={() => save({ send: false })} disabled={saving}>
              <Save className="h-4 w-4" />
              {editingId ? "Save Changes" : "Save as Draft"}
            </Button>
            <Button variant="ghost" render={<Link href={backHref} />}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Skeletons() {
  return (
    <>
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="space-y-6">
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </>
  );
}
