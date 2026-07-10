"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PermissionGate } from "@/components/shared/permission-gate";
import { usePermissions } from "@/components/hooks/use-permissions";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/shared/pagination";
import {
  Plus,
  Eye,
  Pencil,
  Trash,
  FileText,
  Search,
  MoreVertical,
  Send,
  Download,
  RotateCcw,
  CloseCircle,
  Check,
  CirclePlus,
  Upload,
} from "@/lib/icons";
import {
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  formatSAR,
  formatDate,
  getBalance,
  getTotal,
  invoiceNo,
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

const PAGE_SIZE = 20;

export default function InvoicesPage() {
  const { can } = usePermissions();
  const canEdit = can("invoices:edit");
  const canDelete = can("invoices:delete");
  const canRecordPayment = can("payments:create");
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  // Confirm dialog for the destructive / irreversible row actions.
  const [confirm, setConfirm] = useState<{
    type: "delete" | "cancel" | "markPaid";
    invoice: Invoice;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  // Record-payment dialog target (null = closed).
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: PAGE_SIZE };
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      if (search) params.search = search;
      const result = await api.invoices.list(params);
      const rows: Invoice[] = Array.isArray(result) ? result : result?.data || [];
      setInvoices(rows);
      setMeta(Array.isArray(result) ? null : result?.meta ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, fromDate, toDate, search]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce the search box → commit to `search` (resets to page 1).
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch((prev) => {
        if (prev === searchInput) return prev;
        setPage(1);
        return searchInput;
      });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Filters are applied server-side; render the returned page directly.
  const filtered = invoices;


  // Row actions that fire immediately (no confirmation step). Each reloads the
  // list on success and surfaces the error message on failure.
  const runRowAction = useCallback(
    async (action: () => Promise<unknown>, successMsg: string) => {
      try {
        await action();
        toast.success(successMsg);
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    },
    [load],
  );

  const handleSend = useCallback(
    async (inv: Invoice, resend: boolean) => {
      try {
        const res = await api.invoices.send(inv.id);
        if (res?.emailed) {
          toast.success(resend ? "Invoice resent" : "Invoice sent");
        } else {
          toast.warning("Marked sent — no email on file, share the PDF.");
        }
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to send invoice");
      }
    },
    [load],
  );

  const handleDownloadPdf = useCallback(async (inv: Invoice) => {
    try {
      const url = await api.invoices.pdfBlobUrl(inv.id);
      // Open in a new tab; revoke after a beat so the tab can read the blob.
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate PDF");
    }
  }, []);

  // The confirmed (destructive / irreversible) actions.
  const runConfirm = async () => {
    if (!confirm) return;
    const { type, invoice } = confirm;
    setConfirmBusy(true);
    try {
      if (type === "delete") {
        await api.invoices.delete(invoice.id);
        toast.success("Invoice deleted");
      } else if (type === "cancel") {
        await api.invoices.cancel(invoice.id);
        toast.success("Invoice cancelled");
      } else if (type === "markPaid") {
        await api.invoices.markPaid(invoice.id);
        toast.success("Invoice marked as paid");
      }
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setConfirmBusy(false);
    }
  };

  const hasFilters =
    statusFilter !== "ALL" || Boolean(fromDate) || Boolean(toDate) || Boolean(searchInput);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Track billed amounts, payments, and outstanding balances."
        onRefresh={load}
        actions={
          <PermissionGate permission="invoices:create">
            <Button render={<Link href="/billing/invoices/new" />}>
              <Plus className="h-4 w-4" />
              New Invoice
            </Button>
          </PermissionGate>
        }
      />

      <Card>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="space-y-1.5 md:flex-1">
              <Label htmlFor="invoice-search" className="text-xs text-muted-foreground">
                Search
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="invoice-search"
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Number, customer, athlete…"
                  className="w-full pl-8 md:w-64"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter((v as string) ?? "ALL");
                  setPage(1);
                }}
              >
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
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
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
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
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
                  setSearchInput("");
                  setSearch("");
                  setPage(1);
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
                            {invoiceNo(inv)}
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
                        <TableCell className="text-right tabular-nums font-medium text-[#011b2b] dark:text-[#FFCF01]">
                          {formatSAR(getBalance(inv))}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(status)}>
                            {status || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            {(() => {
                              const isSent = ["SENT", "PARTIAL", "OVERDUE"].includes(status);
                              const isPaid = status === "PAID";
                              const isCancelled = status === "CANCELLED";
                              return (
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="Invoice actions"
                                        title="Actions"
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    }
                                  />
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      render={<Link href={`/billing/invoices/${inv.id}`} />}
                                    >
                                      <Eye className="h-4 w-4" />
                                      View
                                    </DropdownMenuItem>
                                    {isDraft && canEdit && (
                                      <DropdownMenuItem
                                        render={
                                          <Link href={`/billing/invoices/${inv.id}/edit`} />
                                        }
                                      >
                                        <Pencil className="h-4 w-4" />
                                        Edit
                                      </DropdownMenuItem>
                                    )}
                                    {isDraft && canEdit && (
                                      <DropdownMenuItem onClick={() => handleSend(inv, false)}>
                                        <Send className="h-4 w-4" />
                                        Send
                                      </DropdownMenuItem>
                                    )}
                                    {isSent && canEdit && (
                                      <DropdownMenuItem onClick={() => handleSend(inv, true)}>
                                        <Send className="h-4 w-4" />
                                        Resend
                                      </DropdownMenuItem>
                                    )}
                                    {isDraft && canEdit && (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          runRowAction(
                                            () => api.invoices.setStatus(inv.id, "SENT"),
                                            "Invoice marked as sent",
                                          )
                                        }
                                      >
                                        <Check className="h-4 w-4" />
                                        Mark as sent (no email)
                                      </DropdownMenuItem>
                                    )}
                                    {isSent && canRecordPayment && (
                                      <DropdownMenuItem onClick={() => setPaying(inv)}>
                                        <CirclePlus className="h-4 w-4" />
                                        Record payment
                                      </DropdownMenuItem>
                                    )}
                                    {isSent && canEdit && (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          setConfirm({ type: "markPaid", invoice: inv })
                                        }
                                      >
                                        <Check className="h-4 w-4" />
                                        Mark as paid
                                      </DropdownMenuItem>
                                    )}
                                    {isCancelled && canEdit && (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          runRowAction(
                                            () => api.invoices.setStatus(inv.id, "DRAFT"),
                                            "Invoice reopened",
                                          )
                                        }
                                      >
                                        <RotateCcw className="h-4 w-4" />
                                        Reopen
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => handleDownloadPdf(inv)}>
                                      <Download className="h-4 w-4" />
                                      Download PDF
                                    </DropdownMenuItem>
                                    {canEdit && (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          runRowAction(
                                            () => api.invoices.pushZoho(inv.id),
                                            "Pushed to Zoho Books",
                                          )
                                        }
                                      >
                                        <Upload className="h-4 w-4" />
                                        Push to Zoho
                                      </DropdownMenuItem>
                                    )}
                                    {!isPaid && !isCancelled && canDelete && <DropdownMenuSeparator />}
                                    {!isPaid && !isCancelled && canDelete && (
                                      <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() =>
                                          setConfirm({ type: "cancel", invoice: inv })
                                        }
                                      >
                                        <CloseCircle className="h-4 w-4" />
                                        Cancel
                                      </DropdownMenuItem>
                                    )}
                                    {canDelete && (
                                      <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() =>
                                          setConfirm({ type: "delete", invoice: inv })
                                        }
                                      >
                                        <Trash className="h-4 w-4" />
                                        Delete
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              );
                            })()}
                          </div>
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
            total={meta?.total ?? filtered.length}
            totalPages={meta?.totalPages ?? 1}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.type === "delete"
            ? "Delete invoice"
            : confirm?.type === "cancel"
              ? "Cancel invoice"
              : "Mark as paid"
        }
        description={
          confirm?.type === "delete"
            ? (["PAID", "PARTIAL"].includes(String(confirm.invoice?.status || "").toUpperCase())
                ? `Invoice ${invoiceNo(confirm.invoice)} has recorded payment(s). Deleting it permanently removes the invoice AND its payment records — this cannot be undone.`
                : `Delete invoice ${invoiceNo(confirm.invoice)}? This cannot be undone.`)
            : confirm?.type === "cancel"
              ? `Cancel invoice ${
                  confirm ? invoiceNo(confirm.invoice) : ""
                }? It will be marked as cancelled.`
              : `Mark invoice ${
                  confirm ? invoiceNo(confirm.invoice) : ""
                } as paid? The remaining balance will be recorded as a payment.`
        }
        confirmLabel={
          confirm?.type === "delete"
            ? "Delete"
            : confirm?.type === "cancel"
              ? "Cancel invoice"
              : "Mark as paid"
        }
        variant={confirm?.type === "markPaid" ? "default" : "destructive"}
        onConfirm={runConfirm}
        loading={confirmBusy}
      />

      <PaymentDialog
        invoice={paying}
        open={!!paying}
        onOpenChange={(o) => !o && setPaying(null)}
        onSaved={() => {
          setPaying(null);
          load();
        }}
      />
    </div>
  );
}

/**
 * Record a payment against an invoice without leaving the list. Defaults the
 * amount to the outstanding balance and validates 0 < amount ≤ balance.
 */
function PaymentDialog({
  invoice,
  open,
  onOpenChange,
  onSaved,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const balance = getBalance(invoice ?? undefined);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(balance ? String(balance) : "");
      setMethod("cash");
      setReference("");
    }
  }, [open, balance]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;
    const value = Number(amount);
    if (!amount || value <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    if (value > balance) {
      toast.error(`Amount cannot exceed the balance (${formatSAR(balance)})`);
      return;
    }
    setSaving(true);
    try {
      await api.invoices.addPayment(invoice.id, {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {invoice ? `${invoiceNo(invoice)} · ` : ""}Outstanding balance:{" "}
            {formatSAR(balance)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-amount">
              Amount (SAR) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pay-amount"
              type="number"
              min="0"
              max={balance || undefined}
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
            <Label htmlFor="pay-ref">Reference</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction id, cheque number…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
