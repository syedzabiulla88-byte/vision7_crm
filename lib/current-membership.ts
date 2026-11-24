/**
 * Order a person's memberships for the Members list so the first one (the row the list
 * shows) is the membership they are IN right now, not a queued renewal.
 *
 * The backend sorts by status (ACTIVE first), which put a future-dated ACTIVE renewal
 * ahead of a FROZEN current plan, so the row showed the renewal's dates instead of the
 * real start date and the end date after the freeze. Here a membership that has already
 * started and is ACTIVE/FROZEN comes first; everything else keeps the backend's order
 * (Array.sort is stable), so a future renewal still beats an EXPIRED plan.
 */
type M = { status?: string | null; startDate?: string | Date | null };

export function isCurrent(m: M, now: Date = new Date()): boolean {
  const s = String(m.status || "").toUpperCase();
  if (s !== "ACTIVE" && s !== "FROZEN") return false;
  if (!m.startDate) return true;
  return new Date(m.startDate as string).getTime() <= now.getTime();
}

export function orderMemberships<T extends M>(list: T[], now: Date = new Date()): T[] {
  return [...list].sort((a, b) => Number(!isCurrent(a, now)) - Number(!isCurrent(b, now)));
}

/**
 * Status to SHOW on a badge. A membership stored as ACTIVE whose start date is still in the
 * future is not in force yet (the door gate already treats it as PENDING), so the list must
 * not call it ACTIVE. Everything else is shown as stored.
 */
export function displayStatus(m: M, now: Date = new Date()): string {
  const s = String(m.status || "").toUpperCase();
  if (s === "ACTIVE" && m.startDate && new Date(m.startDate as string).getTime() > now.getTime()) {
    return "PENDING";
  }
  return s;
}
