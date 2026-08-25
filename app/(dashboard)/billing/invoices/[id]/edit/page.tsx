"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "@/lib/icons";
import { InvoiceForm } from "../../_invoice-form";
import { invoiceNo, type Invoice } from "../../_shared";

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const inv = await api.invoices.get(id);
        if (!cancelled) setInvoice(inv);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load invoice";
          setError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
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

  // Editable while nothing has been collected (DRAFT / SENT / OVERDUE with
  // no payments). After money lands, content is locked (backend enforces the
  // same rule; only due date and notes remain editable via the API).
  const editableStatus = ["DRAFT", "SENT", "OVERDUE"].includes(String(invoice.status || "").toUpperCase());
  const nothingCollected = Number(invoice.amountPaid ?? invoice.paidAmount ?? 0) === 0;
  if (!editableStatus || !nothingCollected) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" render={<Link href={`/billing/invoices/${id}`} />}>
          <ArrowLeft className="h-4 w-4" />
          Back to invoice
        </Button>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-6 text-sm">
          <p className="font-medium">This invoice can no longer be edited.</p>
          <p className="mt-1 text-muted-foreground">
            Invoices are editable until a payment is recorded. Invoice{" "}
            {invoiceNo(invoice)} has status{" "}
            <span className="font-medium">{String(invoice.status).toUpperCase()}</span>.
          </p>
        </div>
      </div>
    );
  }

  return <InvoiceForm editing={invoice} />;
}
