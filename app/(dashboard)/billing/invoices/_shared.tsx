// Shared helpers + constants for the Invoices area.
// Ported from site/src/lib/format.js + the three site/admin/invoices pages.

export function formatSAR(n: unknown): string {
  const num = Number(n ?? 0) || 0;
  // Pinned to en-US rather than the viewer's browser locale — otherwise a
  // browser set to e.g. en-IN renders Indian-style digit grouping
  // (3,15,692.13) instead of the international format (315,692.13).
  return `SAR ${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** YYYY-MM-DD for <input type="date">. */
export function toDateInput(d?: string | Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const INVOICE_STATUSES = [
  "ALL",
  "DRAFT",
  "SENT",
  "PAID",
  "PARTIAL",
  "OVERDUE",
  "CANCELLED",
] as const;

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "online", label: "Online" },
  { value: "other", label: "Other" },
];

/** Tailwind classes for a status pill (light + dark friendly). */
export function statusBadgeClass(status?: string): string {
  switch (String(status || "").toUpperCase()) {
    case "PAID":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
    case "SENT":
      return "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400";
    case "PARTIAL":
      return "bg-[#FFCF01]/15 text-amber-700 border-[#FFCF01]/40 dark:text-[#FFCF01]";
    case "OVERDUE":
      return "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400";
    case "DRAFT":
      return "bg-muted/50 text-foreground border-border";
    case "CANCELLED":
    default:
      return "bg-gray-500/10 text-gray-600 border-gray-500/30 dark:text-gray-400";
  }
}

export interface Invoice {
  id: string;
  number?: string;
  invoiceNumber?: string;
  status?: string;
  issueDate?: string | null;
  dueDate?: string | null;
  total?: number;
  grandTotal?: number;
  subtotal?: number;
  taxAmount?: number;
  tax?: number;
  taxRate?: number;
  discount?: number;
  discountPercent?: number;
  amountPaid?: number;
  paidAmount?: number;
  notes?: string | null;
  athleteId?: string | null;
  membershipId?: string | null;
  athlete?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  } | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  /**
   * Staff member who raised the invoice. Resolved server-side from createdById
   * (a plain string, not a relation) and only returned by the detail endpoint,
   * so it is absent on list rows.
   */
  createdBy?: { id?: string; name?: string | null; email?: string | null } | null;
  /** Sales rep credited with the sale — resolved server-side from salesUserId. */
  salesUserId?: string | null;
  salesUser?: { id?: string; name?: string | null; email?: string | null } | null;
  /**
   * Customer reference (displayed as VCN-00042). Resolved server-side on the
   * detail endpoint: directly for contact-linked invoices, via the athlete's
   * linked contact otherwise. Null when the customer has no CRM contact.
   */
  customerCrn?: number | null;
  /**
   * Set by the backend the moment a hosted-checkout pay-link is minted
   * (createTelrCheckout/createTabbyCheckout/createTamaraCheckout in
   * payments.service.ts) — "telr" | "tabby" | "tamara". Stays populated even
   * after the invoice is settled, so it doubles as "how this got paid" once
   * a payment lands.
   */
  paymentProvider?: string | null;
  paymentCheckoutUrl?: string | null;
  paymentSessionId?: string | null;
  paymentLinkAt?: string | null;
  lineItems?: InvoiceLine[];
  items?: InvoiceLine[];
  payments?: Payment[];
}

export interface InvoiceLine {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
}

export interface Payment {
  id?: string;
  amount?: number;
  currency?: string;
  method?: string;
  reference?: string | null;
  notes?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
  isRefund?: boolean;
}

export function lineItemTotal(li: { quantity?: unknown; unitPrice?: unknown }): number {
  return (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0);
}

/** Amount paid: prefer server field, else sum payments. */
export function getPaid(inv?: Invoice): number {
  if (!inv) return 0;
  if (inv.amountPaid !== undefined && inv.amountPaid !== null) return Number(inv.amountPaid);
  if (inv.paidAmount !== undefined && inv.paidAmount !== null) return Number(inv.paidAmount);
  if (Array.isArray(inv.payments)) {
    return inv.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }
  return 0;
}

export function getTotal(inv?: Invoice): number {
  return Number(inv?.total ?? inv?.grandTotal ?? 0) || 0;
}

export function getBalance(inv?: Invoice): number {
  return Math.max(getTotal(inv) - getPaid(inv), 0);
}

/** Human-facing invoice number (INV-2026-0001), with safe fallbacks. */
export function invoiceNo(inv?: Pick<Invoice, "id" | "number" | "invoiceNumber"> | null): string {
  return inv?.number ?? inv?.invoiceNumber ?? `#${String(inv?.id || "").slice(-8)}`;
}
