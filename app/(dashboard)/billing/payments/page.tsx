"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Warning, Plus, Search, ArrowLeft, Download } from "@/lib/icons";
import { downloadCsv } from "@/lib/csv";
import {
  formatSAR,
  formatDateTime,
  getBalance,
  invoiceNo,
  statusBadgeClass,
  PAYMENT_METHODS,
  type Invoice,
} from "../invoices/_shared";

const PAGE_SIZE = 20;

interface PaymentRow {
  id: string;
  amount?: number;
  currency?: string;
  method?: string | null;
  reference?: string | null;
  paidAt?: string | null;
  isRefund?: boolean;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  number?: string | null;
  customerName?: string | null;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const METHOD_OPTIONS = [
  { value: "ALL", label: "All methods" },
  ...PAYMENT_METHODS,
];

const TYPE_OPTIONS = [
  { value: "ALL", label: "All types" },
  { value: "PAYMENTS", label: "Payments" },
  { value: "REFUNDS", label: "Refunds" },
];

/** Map a stored method value to a readable label. */
function methodLabel(method?: string | null): string {
  if (!method) return "—";
  const hit = PAYMENT_METHODS.find((m) => m.value === method);
  if (hit) return hit.label;
  return String(method).replace(/_/g, " ");
}

/** Backend may send the invoice number on `invoiceNumber` or `number`. */
function paymentInvoiceNumber(p: PaymentRow): string {
  return p.invoiceNumber || p.number || (p.invoiceId ? `#${String(p.invoiceId).slice(0, 8)}` : "—");
}

export default function PaymentsLedgerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);

  const [methodFilter, setMethodFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [recordOpen, setRecordOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { page, limit: PAGE_SIZE };
      if (methodFilter !== "ALL") params.method = methodFilter;
      if (typeFilter === "PAYMENTS") params.isRefund = false;
      if (typeFilter === "REFUNDS") params.isRefund = true;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;

      const result = await api.payments.list(params);
      const data: PaymentRow[] = Array.isArray(result) ? result : result?.data || [];
      setRows(data);
      setMeta(Array.isArray(result) ? null : result?.meta ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load payments";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, methodFilter, typeFilter, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilters =
    methodFilter !== "ALL" || typeFilter !== "ALL" || Boolean(fromDate) || Boolean(toDate);

  const clearFilters = () => {
    setMethodFilter("ALL");
    setTypeFilter("ALL");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  // Export EVERY payment matching the current filters — walks the
  // pagination server-side, capped at 5000 rows.
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const all: PaymentRow[] = [];
      for (let p = 1; p <= 25; p++) {
        const params: Record<string, unknown> = { page: p, limit: 200 };
        if (methodFilter !== "ALL") params.method = methodFilter;
        if (typeFilter === "PAYMENTS") params.isRefund = false;
        if (typeFilter === "REFUNDS") params.isRefund = true;
        if (fromDate) params.from = fromDate;
        if (toDate) params.to = toDate;
        const result = await api.payments.list(params);
        const batch: PaymentRow[] = Array.isArray(result) ? result : result?.data || [];
        all.push(...batch);
        const totalPages = Array.isArray(result) ? 1 : Number(result?.meta?.totalPages) || 1;
        if (p >= totalPages || batch.length === 0) break;
      }
      if (!all.length) {
        toast.info("Nothing to export");
        return;
      }
      downloadCsv(
        `payments-${new Date().toISOString().slice(0, 10)}.csv`,
        all.map((p) => ({
          date: String(p.paidAt || "").slice(0, 10),
          type: p.isRefund ? "Refund" : "Payment",
          method: methodLabel(p.method),
          amount: Number(p.amount) || 0,
          currency: p.currency || "SAR",
          invoice: paymentInvoiceNumber(p),
          customer: p.customerName || "",
          reference: p.reference || "",
        })),
      );
      toast.success(`Exported ${all.length} payment${all.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <PermissionGate
      permission="payments:view"
      fallback={
        <div className="flex flex-col items-center gap-2 py-24 text-center text-muted-foreground">
          <Warning className="h-6 w-6" />
          <p>You don&apos;t have permission to view payments.</p>
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Payments"
          description="Every payment and refund across all invoices."
          onRefresh={load}
          actions={
            <>
              <Button variant="outline" onClick={handleExportCsv} disabled={exporting || loading}>
                <Download className="h-4 w-4" />
                {exporting ? "Exporting…" : "Export CSV"}
              </Button>
              <Button onClick={() => setRecordOpen(true)}>
                <Plus className="h-4 w-4" />
                Record payment
              </Button>
            </>
          }
        />

        <Card>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Method</Label>
                <Select
                  value={methodFilter}
                  onValueChange={(v) => {
                    setMethodFilter((v as string) ?? "ALL");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full md:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHOD_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select
                  value={typeFilter}
                  onValueChange={(v) => {
                    setTypeFilter((v as string) ?? "ALL");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full md:w-40">
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
                <Label htmlFor="from-date" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="from-date"
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full md:w-44"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to-date" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="to-date"
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full md:w-44"
                />
              </div>
              {hasFilters && (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Warning className="h-6 w-6 text-red-500" />
                          <p>{error}</p>
                          <Button variant="outline" size="sm" onClick={load}>
                            Retry
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <p>{hasFilters ? "No payments match your filters." : "No payments"}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((p) => {
                      const amt = Number(p.amount || 0);
                      const isRefund = Boolean(p.isRefund);
                      const invNumber = paymentInvoiceNumber(p);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDateTime(p.paidAt)}
                          </TableCell>
                          <TableCell>
                            {p.invoiceId ? (
                              <Link
                                href={`/billing/invoices/${p.invoiceId}`}
                                className="font-mono text-xs hover:text-primary"
                              >
                                {invNumber}
                              </Link>
                            ) : (
                              <span className="font-mono text-xs text-muted-foreground">
                                {invNumber}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{p.customerName || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {methodLabel(p.method)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.reference || "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="inline-flex items-center justify-end gap-2">
                              {isRefund && (
                                <Badge
                                  variant="outline"
                                  className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                                >
                                  Refund
                                </Badge>
                              )}
                              <span
                                className={
                                  isRefund
                                    ? "font-medium text-red-600 dark:text-red-400"
                                    : "font-medium text-emerald-600 dark:text-emerald-400"
                                }
                              >
                                {isRefund ? "−" : ""}
                                {formatSAR(amt)}
                              </span>
                            </span>
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
              total={meta?.total ?? rows.length}
              totalPages={meta?.totalPages ?? 1}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>

        {recordOpen && (
          <RecordPaymentDialog
            onClose={() => setRecordOpen(false)}
            onSaved={() => {
              setRecordOpen(false);
              load();
            }}
          />
        )}
      </div>
    </PermissionGate>
  );
}

// ─── Record payment dialog ───────────────────────────────────────────────────────

/** Backend may send the outstanding balance on `balance`; else derive it. */
type InvoiceOption = Invoice & { balance?: number };

const PAYABLE_STATUSES = new Set(["SENT", "PARTIAL", "OVERDUE"]);

/** Outstanding balance for an invoice — prefer the server `balance`, else derive. */
function invoiceBalance(inv: InvoiceOption): number {
  if (inv.balance !== undefined && inv.balance !== null) return Number(inv.balance) || 0;
  return getBalance(inv);
}

/** Recipient/customer name for an invoice row. */
function invoiceRecipient(inv: InvoiceOption): string {
  if (inv.athlete) {
    const n = `${inv.athlete.firstName || ""} ${inv.athlete.lastName || ""}`.trim();
    if (n) return n;
  }
  return inv.customerName || "—";
}

function RecordPaymentDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  // Step 1 — search + pick an invoice.
  const [searchInput, setSearchInput] = useState("");
  const [results, setResults] = useState<InvoiceOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<InvoiceOption | null>(null);

  // Step 2 — payment fields.
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  // Debounced invoice search (~300ms). Only runs while no invoice is selected.
  useEffect(() => {
    if (selected) return;
    const term = searchInput.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.invoices.list({ search: term, limit: 10 });
        const found: InvoiceOption[] = Array.isArray(res) ? res : res?.data || [];
        setResults(found);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to search invoices");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, selected]);

  const pickInvoice = (inv: InvoiceOption) => {
    setSelected(inv);
    setAmount(String(invoiceBalance(inv)));
  };

  const backToSearch = () => {
    setSelected(null);
    setAmount("");
    setReference("");
    setMethod("cash");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const value = Number(amount);
    const balance = invoiceBalance(selected);
    if (!amount || value <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    if (value > balance) {
      toast.error(`Amount cannot exceed the outstanding balance (${formatSAR(balance)})`);
      return;
    }
    setSaving(true);
    try {
      await api.invoices.addPayment(selected.id, {
        amount: value,
        method,
        reference: reference.trim() || undefined,
      });
      toast.success("Payment recorded");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const selectedBalance = selected ? invoiceBalance(selected) : 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {selected
              ? "Record a payment against the selected invoice."
              : "Search for an invoice to record a payment against."}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          /* ── Step 1: pick an invoice ── */
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="record-search" className="text-xs text-muted-foreground">
                Find invoice
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="record-search"
                  type="search"
                  autoFocus
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Number, customer, athlete…"
                  className="w-full pl-8"
                />
              </div>
            </div>

            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {searching ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-md" />
                ))
              ) : !searchInput.trim() ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Start typing to search invoices.
                </p>
              ) : results.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No invoices match your search.
                </p>
              ) : (
                results.map((inv) => {
                  const status = String(inv.status || "").toUpperCase();
                  const payable = PAYABLE_STATUSES.has(status);
                  const balance = invoiceBalance(inv);
                  return (
                    <button
                      key={inv.id}
                      type="button"
                      disabled={!payable}
                      onClick={() => payable && pickInvoice(inv)}
                      className={`w-full rounded-md border p-3 text-left transition-colors ${
                        payable
                          ? "cursor-pointer hover:border-primary/50 hover:bg-muted"
                          : "cursor-not-allowed opacity-60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs">{invoiceNo(inv)}</p>
                          <p className="truncate text-sm">{invoiceRecipient(inv)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={statusBadgeClass(status)}>
                            {status || "—"}
                          </Badge>
                          <span className="tabular-nums text-sm font-medium">
                            {formatSAR(balance)}
                          </span>
                        </div>
                      </div>
                      {!payable && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Nothing to pay on this invoice.
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* ── Step 2: enter payment details ── */
          <form onSubmit={submit} className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs">{invoiceNo(selected)}</p>
                  <p className="truncate text-sm">{invoiceRecipient(selected)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={backToSearch}
                  disabled={saving}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Change
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Outstanding balance</span>
                <span className="tabular-nums font-medium">{formatSAR(selectedBalance)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="record-amount">
                Amount (SAR) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="record-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod((v as string) || "cash")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="record-ref">Reference</Label>
              <Input
                id="record-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Transaction id, cheque number…"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Recording…" : "Record payment"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
