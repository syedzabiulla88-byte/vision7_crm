"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
  ArrowLeft,
  Send,
  Printer,
  Trash,
  CloseCircle,
  CheckCircle,
  Pencil,
  Download,
  RotateCcw,
} from "@/lib/icons";
import {
  PAYMENT_METHODS,
  formatSAR,
  formatDate,
  formatDateTime,
  toDateInput,
  getPaid,
  getTotal,
  invoiceNo,
  lineItemTotal,
  statusBadgeClass,
  type Invoice,
  type InvoiceLine,
  type Payment,
} from "../_shared";

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showRefund, setShowRefund] = useState(false);

  // Confirmation dialogs
  const [confirm, setConfirm] = useState<
    null | "send" | "resend" | "markPaid" | "markSent" | "cancel" | "reopen" | "delete"
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const inv = await api.invoices.get(id);
      setInvoice(inv);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownloadPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const url = await api.invoices.pdfBlobUrl(id);
      // Open in a new tab; revoke after a beat so the tab can read the blob.
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm === "send" || confirm === "resend") {
        const res = await api.invoices.send(id);
        if (res?.emailed) {
          toast.success("Invoice sent");
        } else {
          toast.warning("Marked sent — no email on file, share the PDF.");
        }
        await load();
      } else if (confirm === "markPaid") {
        await api.invoices.markPaid(id);
        toast.success("Invoice marked paid");
        await load();
      } else if (confirm === "markSent") {
        await api.invoices.setStatus(id, "SENT");
        toast.success("Marked as sent");
        await load();
      } else if (confirm === "cancel") {
        await api.invoices.cancel(id);
        toast.success("Invoice cancelled");
        await load();
      } else if (confirm === "reopen") {
        await api.invoices.setStatus(id, "DRAFT");
        toast.success("Invoice reopened");
        await load();
      } else if (confirm === "delete") {
        await api.invoices.delete(id);
        toast.success("Invoice deleted");
        router.push("/billing/invoices");
        return;
      }
      setConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setConfirmBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-10 w-full animate-pulse rounded bg-muted" />
        <div className="h-96 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" render={<Link href="/billing/invoices" />}>
          <ArrowLeft className="h-4 w-4" />
          Back to invoices
        </Button>
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          {error || "Invoice not found."}
        </div>
      </div>
    );
  }

  const status = String(invoice.status || "").toUpperCase();
  const isDraft = status === "DRAFT";
  const isCancelled = status === "CANCELLED";
  const isPaid = status === "PAID";
  const canPay = !isDraft && !isCancelled && !isPaid;
  // Resend applies to already-sent statuses (not draft/paid/cancelled).
  const canResend = ["SENT", "PARTIAL", "OVERDUE"].includes(status);

  const lineItems: InvoiceLine[] = Array.isArray(invoice.lineItems)
    ? invoice.lineItems
    : Array.isArray(invoice.items)
      ? invoice.items
      : [];
  const payments: Payment[] = Array.isArray(invoice.payments) ? invoice.payments : [];
  const total = getTotal(invoice);
  const paid = getPaid(invoice);
  const balance = Math.max(total - paid, 0);
  // Refund is available once money has been collected (PAID/PARTIAL/OVERDUE).
  const canRefund = paid > 0 && !isDraft && !isCancelled;
  const subtotal = Number(
    invoice.subtotal ?? lineItems.reduce((s, li) => s + lineItemTotal(li), 0),
  );
  const tax = Number(invoice.taxAmount ?? invoice.tax ?? 0);
  const discount = Number(invoice.discount ?? 0);

  return (
    <div className="space-y-6">
      {/* Back link (print-hidden) */}
      <div className="print:hidden">
        <Button variant="ghost" size="sm" render={<Link href="/billing/invoices" />}>
          <ArrowLeft className="h-4 w-4" />
          Back to invoices
        </Button>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap gap-2 print:hidden">
        {isDraft && (
          <>
            <Button onClick={() => setConfirm("send")}>
              <Send className="h-4 w-4" />
              Send
            </Button>
            <Button variant="outline" render={<Link href={`/billing/invoices/${id}/edit`} />}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirm("delete")}
              className="text-destructive hover:text-destructive"
            >
              <Trash className="h-4 w-4" />
              Delete
            </Button>
          </>
        )}
        {canResend && (
          <Button variant="outline" onClick={() => setConfirm("resend")}>
            <Send className="h-4 w-4" />
            Resend
          </Button>
        )}
        {canPay && (
          <Button onClick={() => setShowPayment(true)}>
            <Download className="h-4 w-4" />
            Record Payment
          </Button>
        )}
        {canRefund && (
          <Button variant="outline" onClick={() => setShowRefund(true)}>
            <RotateCcw className="h-4 w-4" />
            Record refund
          </Button>
        )}

        {/* Change status (guided / safe) */}
        {canPay && (
          <Button variant="outline" onClick={() => setConfirm("markPaid")}>
            <CheckCircle className="h-4 w-4" />
            Mark as paid
          </Button>
        )}
        {isDraft && (
          <Button variant="outline" onClick={() => setConfirm("markSent")}>
            <Send className="h-4 w-4" />
            Mark as sent
          </Button>
        )}
        {isCancelled && (
          <Button variant="outline" onClick={() => setConfirm("reopen")}>
            <RotateCcw className="h-4 w-4" />
            Reopen
          </Button>
        )}
        {!isPaid && !isCancelled && (
          <Button
            variant="outline"
            onClick={() => setConfirm("cancel")}
            className="text-destructive hover:text-destructive"
          >
            <CloseCircle className="h-4 w-4" />
            Cancel Invoice
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleDownloadPdf}
          disabled={downloadingPdf}
          className="ml-auto"
        >
          <Printer className="h-4 w-4" />
          {downloadingPdf ? "Preparing…" : "PDF"}
        </Button>
        <Button variant="outline" onClick={handleDownloadPdf} disabled={downloadingPdf}>
          <Printer className="h-4 w-4" />
          {downloadingPdf ? "Preparing…" : "Print"}
        </Button>
      </div>

      {/* Invoice card (printable) */}
      <div
        id="invoice-print-area"
        className="rounded-xl border bg-card p-6 text-card-foreground shadow-xs ring-1 ring-foreground/10 lg:p-10 print:border-black print:shadow-none print:ring-0"
      >
        {/* Header */}
        <div className="flex flex-col gap-5 border-b pb-6 md:flex-row md:items-start md:justify-between print:border-black">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#FFCF01]">Invoice</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
              {invoiceNo(invoice)}
            </h1>
          </div>
          <div className="text-left md:text-right">
            <Badge variant="outline" className={statusBadgeClass(status)}>
              {status}
            </Badge>
            <div className="mt-4 space-y-1 text-sm">
              <p className="text-muted-foreground print:text-black">
                <span className="text-xs uppercase tracking-widest text-[#FFCF01]">Issued</span>{" "}
                {formatDate(invoice.issueDate)}
              </p>
              <p className="text-muted-foreground print:text-black">
                <span className="text-xs uppercase tracking-widest text-[#FFCF01]">Due</span>{" "}
                {formatDate(invoice.dueDate)}
              </p>
            </div>
          </div>
        </div>

        {/* From / Billed to */}
        <div className="grid grid-cols-1 gap-8 py-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#FFCF01]">
              From
            </p>
            <p className="text-lg font-bold">Vision7</p>
            <p className="text-sm text-muted-foreground print:text-black">Athletic Academy</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#FFCF01]">
              Billed to
            </p>
            {invoice.athlete ? (
              <>
                <p className="text-lg font-bold">
                  {invoice.athlete.firstName} {invoice.athlete.lastName}
                </p>
                {invoice.athlete.email && (
                  <p className="text-sm text-muted-foreground print:text-black">
                    {invoice.athlete.email}
                  </p>
                )}
                {invoice.athlete.phone && (
                  <p className="text-sm text-muted-foreground print:text-black">
                    {invoice.athlete.phone}
                  </p>
                )}
              </>
            ) : invoice.customerName ? (
              <>
                <p className="text-lg font-bold">{invoice.customerName}</p>
                {invoice.customerEmail && (
                  <p className="text-sm text-muted-foreground print:text-black">
                    {invoice.customerEmail}
                  </p>
                )}
                {invoice.customerPhone && (
                  <p className="text-sm text-muted-foreground print:text-black">
                    {invoice.customerPhone}
                  </p>
                )}
                {invoice.customerAddress && (
                  <p className="text-sm text-muted-foreground print:text-black">
                    {invoice.customerAddress}
                  </p>
                )}
                <Badge variant="outline" className="mt-2 text-[10px] print:hidden">
                  Walk-in customer
                </Badge>
              </>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </div>
        </div>

        {/* Line items */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y bg-muted/40 print:border-black print:bg-transparent">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-[#FFCF01]">
                  Description
                </th>
                <th className="w-20 px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-[#FFCF01]">
                  Qty
                </th>
                <th className="w-32 px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-[#FFCF01]">
                  Unit Price
                </th>
                <th className="w-32 px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-[#FFCF01]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No line items.
                  </td>
                </tr>
              ) : (
                lineItems.map((li, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">{li.description}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground print:text-black">
                      {li.quantity}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground print:text-black">
                      {formatSAR(li.unitPrice)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatSAR(li.total ?? lineItemTotal(li))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end pt-6">
          <div className="w-full space-y-2 text-sm md:w-80">
            <div className="flex justify-between">
              <span className="text-muted-foreground print:text-black">Total (excl. VAT)</span>
              <span className="tabular-nums">{formatSAR(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground print:text-black">
                VAT ({Number(invoice.taxRate ?? 0)}%)
              </span>
              <span className="tabular-nums">{formatSAR(tax)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground print:text-black">Discount</span>
              <span className="tabular-nums">- {formatSAR(discount)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-3 print:border-black">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FFCF01]">
                Total (incl. VAT)
              </span>
              <span className="text-2xl font-bold tabular-nums">{formatSAR(total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground print:text-black">Paid</span>
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400 print:text-black">
                {formatSAR(paid)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground print:text-black">Balance due</span>
              <span className="font-bold tabular-nums text-[#FFCF01] print:text-black">
                {formatSAR(balance)}
              </span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-6 border-t pt-6 print:border-black">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#FFCF01]">
              Notes
            </p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground print:text-black">
              {invoice.notes}
            </p>
          </div>
        )}
      </div>

      {/* Payments */}
      <div className="rounded-xl border bg-card p-6 shadow-xs ring-1 ring-foreground/10 print:hidden">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-[#FFCF01]">
          Payments
        </p>
        {payments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No payments recorded.</p>
        ) : (
          <div className="divide-y">
            {payments.map((p) => {
              const refund = Boolean(p.isRefund);
              return (
              <div
                key={p.id || p.reference || `${p.paidAt}-${p.amount}`}
                className="flex flex-wrap gap-4 py-3 text-sm"
              >
                <div className="min-w-[160px] flex-1">
                  <p
                    className={`font-semibold tabular-nums ${
                      refund ? "text-red-600 dark:text-red-400" : ""
                    }`}
                  >
                    {refund
                      ? `Refund −${formatSAR(Math.abs(Number(p.amount) || 0))}`
                      : formatSAR(p.amount)}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {p.method || "—"}
                  </p>
                </div>
                <div className="min-w-[160px] flex-1">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Date</p>
                  <p>{formatDateTime(p.paidAt || p.createdAt)}</p>
                </div>
                <div className="min-w-[160px] flex-1">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Reference
                  </p>
                  <p className="font-mono text-xs">{p.reference || "—"}</p>
                </div>
                {p.notes && (
                  <div className="w-full">
                    <p className="text-xs text-muted-foreground">{p.notes}</p>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment dialog */}
      <PaymentDialog
        open={showPayment}
        onOpenChange={setShowPayment}
        invoiceId={id}
        balance={balance}
        onSaved={() => {
          setShowPayment(false);
          load();
        }}
      />

      {/* Refund dialog */}
      <RefundDialog
        open={showRefund}
        onOpenChange={setShowRefund}
        invoiceId={id}
        maxAmount={paid}
        onSaved={() => {
          setShowRefund(false);
          load();
        }}
      />

      {/* Send / Resend / Cancel / Delete confirmations */}
      <ConfirmDialog
        open={confirm === "send"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Send invoice"
        description="Send this invoice now? The PDF will be emailed to the customer."
        confirmLabel="Send"
        onConfirm={runConfirm}
        loading={confirmBusy}
      />
      <ConfirmDialog
        open={confirm === "resend"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Resend invoice"
        description="Resend this invoice to the customer? The PDF will be emailed again."
        confirmLabel="Resend"
        onConfirm={runConfirm}
        loading={confirmBusy}
      />
      <ConfirmDialog
        open={confirm === "markPaid"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Mark as paid"
        description={`Record the remaining balance (${formatSAR(balance)}) as a cash payment and mark this invoice paid?`}
        confirmLabel="Mark as paid"
        onConfirm={runConfirm}
        loading={confirmBusy}
      />
      <ConfirmDialog
        open={confirm === "markSent"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Mark as sent"
        description="Mark this invoice as sent without emailing it? Use this when you have shared the invoice another way."
        confirmLabel="Mark as sent"
        onConfirm={runConfirm}
        loading={confirmBusy}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Cancel invoice"
        description="Cancel this invoice?"
        confirmLabel="Cancel invoice"
        variant="destructive"
        onConfirm={runConfirm}
        loading={confirmBusy}
      />
      <ConfirmDialog
        open={confirm === "reopen"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reopen invoice"
        description="Reopen this cancelled invoice? It will return to draft so you can edit and re-issue it."
        confirmLabel="Reopen"
        onConfirm={runConfirm}
        loading={confirmBusy}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete invoice"
        description="Delete this invoice? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={runConfirm}
        loading={confirmBusy}
      />

      {/* Print styles: hide everything but the invoice card. */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #invoice-print-area,
          #invoice-print-area * {
            visibility: visible;
          }
          #invoice-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

function PaymentDialog({
  open,
  onOpenChange,
  invoiceId,
  balance,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  balance: number;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paidAt, setPaidAt] = useState(toDateInput(new Date()));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(balance ? String(balance) : "");
      setMethod("cash");
      setReference("");
      setNotes("");
      setPaidAt(toDateInput(new Date()));
    }
  }, [open, balance]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    setSaving(true);
    try {
      await api.invoices.addPayment(invoiceId, {
        amount: Number(amount),
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        paidAt: paidAt || undefined,
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
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>Balance due: {formatSAR(balance)}</DialogDescription>
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
          <div className="space-y-2">
            <Label htmlFor="pay-date">Paid at</Label>
            <Input
              id="pay-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-notes">Notes</Label>
            <Textarea
              id="pay-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const REFUND_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank-transfer", label: "Bank transfer" },
  { value: "online", label: "Online" },
  { value: "other", label: "Other" },
];

function RefundDialog({
  open,
  onOpenChange,
  invoiceId,
  maxAmount,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  maxAmount: number;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(maxAmount ? String(maxAmount) : "");
      setMethod("cash");
      setReason("");
    }
  }, [open, maxAmount]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!amount || value <= 0) {
      toast.error("Enter a refund amount greater than 0");
      return;
    }
    if (value > maxAmount) {
      toast.error(`Refund cannot exceed the amount paid (${formatSAR(maxAmount)})`);
      return;
    }
    setSaving(true);
    try {
      await api.invoices.refund(invoiceId, {
        amount: value,
        method,
        reason: reason.trim() || undefined,
      });
      toast.success("Refund recorded");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record refund");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record refund</DialogTitle>
          <DialogDescription>Amount paid: {formatSAR(maxAmount)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="refund-amount">
              Amount (SAR) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="refund-amount"
              type="number"
              min="0"
              max={maxAmount || undefined}
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
                {REFUND_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-reason">Reason</Label>
            <Textarea
              id="refund-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Record refund"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
