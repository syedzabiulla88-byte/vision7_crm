/**
 * Membership date sanity check. Dates are "YYYY-MM-DD" strings from <input type="date">,
 * which compare correctly as plain strings. An empty end date means open-ended and is fine.
 * Returns an error message, or null when the range is OK.
 */
export function endDateError(start?: string | null, end?: string | null): string | null {
  if (!start || !end) return null;
  return end <= start ? "End date must be after the start date." : null;
}
