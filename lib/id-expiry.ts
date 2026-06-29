// Shared rule for highlighting ID/Iqama/Passport expiry across the CRM.
// Returns null when there's nothing to flag, else a tone + label for a badge:
//   red   → already expired
//   amber → expires within 30 days
export type IdExpiryStatus = { tone: "red" | "amber"; label: string } | null;

export function idExpiryStatus(value?: string | Date | null): IdExpiryStatus {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const day = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((d.getTime() - Date.now()) / day);
  if (diffDays < 0) return { tone: "red", label: "ID expired" };
  if (diffDays <= 30)
    return { tone: "amber", label: diffDays === 0 ? "ID expires today" : `ID expires in ${diffDays}d` };
  return null;
}

/** Format an ISO/Date value for a native <input type="date"> (YYYY-MM-DD), or "". */
export function toDateInputValue(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
