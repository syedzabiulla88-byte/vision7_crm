import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Human-facing customer reference: 42 -> "VCN-00042" (Vision7 Customer
 * Number). Stored in the DB as crm_contacts.crn; VCN is the display name.
 */
export function formatVcn(crn?: number | null): string {
  return crn == null ? "" : `VCN-${String(crn).padStart(5, "0")}`;
}

/**
 * YYYY-MM-DD for the date as the user sees it (local calendar day).
 * Do NOT use `date.toISOString().slice(0, 10)` for this: it converts to UTC first, which
 * moves local midnight back a day in any timezone ahead of UTC (e.g. Saudi, UTC+3).
 */
export function toLocalISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Value for <input type="date">. A server date string (`2026-10-10` or
 * `2026-10-10T00:00:00.000Z`) already carries the calendar day — keep it as-is; a `Date`
 * object is a moment in the browser's timezone — use its local calendar day.
 */
export function toDateInputValue(value?: string | Date | null): string {
  if (!value) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : toLocalISODate(value);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (m) return m[1];
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : toLocalISODate(d);
}
