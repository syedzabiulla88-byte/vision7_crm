/** "INV-2026-0502" -> "502" for compact display. */
export function shortGap(n: string): string {
  const m = String(n).match(/-(\d+)$/);
  return m ? String(parseInt(m[1], 10)) : n;
}
