"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
import { Plus, Eye, Pencil, Trash, FileText } from "@/lib/icons";
import {
  INVOICE_STATUSES,
  formatSAR,
  formatDate,
  getBalance,
  getPaid,
  getTotal,
  statusBadgeClass,
  type Invoice,
} from "./_shared";

function recipientName(inv: Invoice): { name: string; walkIn: boolean } {
  if (inv.athlete) {
    const n = `${inv.athlete.firstName || ""} ${inv.athlete.lastName || ""}`.trim();
    return { name: n || "—", walkIn: false };
  }
  if (inv.customerName) return { name: inv.customerName, walkIn: true };
  return { name: "—", walkIn: false };
}

export default function InvoicesPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.invoices.list({ limit: 1000 });
      const rows: Invoice[] = Array.isArray(result) ? result : result?.data || [];
      setInvoices(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== "ALL" && String(inv.status || "").toUpperCase() !== statusFilter) {
        return false;
      }
      const issued = inv.issueDate ? new Date(inv.issueDate) : null;
      if (fromDate && issued && issued < new Date(fromDate)) return false;
      if (toDate && issued) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        if (issued > end) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, fromDate, toDate]);

  // Totals reflect the current filter so the cards stay meaningful.
  const totals = useMemo(() => {
    let total = 0;
    let paid = 0;
    for (const inv of filtered) {
      total += getTotal(inv);
      paid += getPaid(inv);
    }
    return { total, paid, outstanding: Math.max(total - paid, 0), count: filtered.length };
  }, [filtered]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.invoices.delete(deleting.id);
      toast.success("Invoice deleted");
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete invoice");
    } finally {
      setDeleteBusy(false);
    }
  };

  const hasFilters = statusFilter !== "ALL" || Boolean(fromDate) || Boolean(toDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Track billed amounts, payments, and outstanding balances."
        actions={
          <Button render={<Link href="/billing/invoices/new" />}>
            <Plus className="h-4 w-4" />
            New Invoice
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Invoices" value={totals.count} hue="navy" />
        <StatCard label="Total" value={formatSAR(totals.total)} hue="navy" />
        <StatCard label="Paid" value={formatSAR(totals.paid)} hue="emerald" />
        <StatCard label="Outstanding" value={formatSAR(totals.outstanding)} hue="yellow" />
      </div>

      <Card>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as string) ?? "ALL")}>
                <SelectTrigger className="w-full md:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "ALL" ? "All statuses" : s.charAt(0) + s.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from-date" className="text-xs text-muted-foreground">
                Issued from
              </Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full md:w-44"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to-date" className="text-xs text-muted-foreground">
                Issued to
              </Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full md:w-44"
              />
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStatusFilter("ALL");
                  setFromDate("");
                  setToDate("");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-6 w-6" />
                        <p>
                          {hasFilters
                            ? "No invoices match your filters."
                            : "No invoices yet. Create your first invoice to get started."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((inv) => {
                    const status = String(inv.status || "").toUpperCase();
                    const isDraft = status === "DRAFT";
                    const rec = recipientName(inv);
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Link
                            href={`/billing/invoices/${inv.id}`}
                            className="font-mono text-xs hover:text-primary"
                          >
                            {inv.invoiceNumber || `#${String(inv.id).slice(0, 8)}`}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2">
                            <span>{rec.name}</span>
                            {rec.walkIn && (
                              <Badge variant="outline" className="text-[10px]">
                                walk-in
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(inv.issueDate)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(inv.dueDate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatSAR(getTotal(inv))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-[#FFCF01]">
                          {formatSAR(getBalance(inv))}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(status)}>
                            {status || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="icon-sm"
                              render={<Link href={`/billing/invoices/${inv.id}`} />}
                              aria-label="View invoice"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {isDraft && (
                              <>
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  render={<Link href={`/billing/invoices/${inv.id}/edit`} />}
                                  aria-label="Edit invoice"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  onClick={() => setDeleting(inv)}
                                  aria-label="Delete invoice"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete invoice"
        description={`Delete invoice ${
          deleting?.invoiceNumber || deleting?.id?.slice(0, 8) || ""
        }? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteBusy}
      />
    </div>
  );
}
