/** An invoice is "issued" once it has left DRAFT or taken a payment. Mirrors the backend rule. */
export function isIssuedInvoice(inv: { status?: string | null; amountPaid?: number | string | null; paidAmount?: number | string | null }): boolean {
  if (String(inv.status ?? "").toUpperCase() !== "DRAFT") return true;
  return Number(inv.amountPaid ?? inv.paidAmount ?? 0) > 0;
}

export const MIN_RENUMBER_REASON = 5;

/** "INV-2026-0502" -> "502" for compact display. */
export function shortGap(n: string): string {
  const m = String(n).match(/-(\d+)$/);
  return m ? String(parseInt(m[1], 10)) : n;
}
