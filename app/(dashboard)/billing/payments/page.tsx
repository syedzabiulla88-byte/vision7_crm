"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
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
import { Warning } from "@/lib/icons";
import { formatSAR, formatDateTime, PAYMENT_METHODS } from "../invoices/_shared";

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

  // Stat cards are computed from the loaded page (kept simple per spec).
  const totals = useMemo(() => {
    let collected = 0;
    let refunded = 0;
    for (const p of rows) {
      const amt = Number(p.amount || 0);
      if (p.isRefund) refunded += amt;
      else collected += amt;
    }
    return { collected, refunded, net: collected - refunded };
  }, [rows]);

  const hasFilters =
    methodFilter !== "ALL" || typeFilter !== "ALL" || Boolean(fromDate) || Boolean(toDate);

  const clearFilters = () => {
    setMethodFilter("ALL");
    setTypeFilter("ALL");
    setFromDate("");
    setToDate("");
    setPage(1);
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
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total collected" value={formatSAR(totals.collected)} hue="emerald" />
          <StatCard label="Total refunded" value={formatSAR(totals.refunded)} hue="rose" />
          <StatCard label="Net" value={formatSAR(totals.net)} hue="navy" />
        </div>

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
      </div>
    </PermissionGate>
  );
}
