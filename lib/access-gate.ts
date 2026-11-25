// Card Access rule: who may be given a card / door access right now. No imports, so it runs in the
// browser and under `node --experimental-strip-types` for tests (see lib/access-gate.test.mjs).
//
// A member without a valid membership (expired, pending, cancelled, none) must not be assigned a card,
// a face, door groups or a QR pass. Staff (USER) have no memberships at all (their door access is set by
// job role), so they are never blocked. Revoking is always allowed and is not gated here.

export interface GateLike {
  status?: string | null;
  valid?: boolean;
}

export interface DetailLike {
  membership?: GateLike | null;
  /** Full breakdown from the server; used only to say WHEN a queued membership starts. */
  gate?: { memberships?: { status?: string | null; startDate?: string | Date | null }[] } | null;
}

/** Earliest start date of an ACTIVE membership that has not started yet, or null. */
function nextStart(detail: DetailLike, now: Date): Date | null {
  const times = (detail.gate?.memberships ?? [])
    .filter((m) => String(m.status ?? "").toUpperCase() === "ACTIVE" && m.startDate)
    .map((m) => new Date(m.startDate as string))
    .filter((d) => d.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return times[0] ?? null;
}

/** A membership counts as valid when the server says so, else when its status is ACTIVE. */
export function membershipIsValid(gate: GateLike | null | undefined): boolean {
  return gate?.valid ?? String(gate?.status ?? "").toUpperCase() === "ACTIVE";
}

/** Why new access can't be granted to this person, or null when it can. */
export function accessBlockReason(
  subjectKind: string,
  detail: DetailLike | null | undefined,
  now: Date = new Date(),
): string | null {
  if (subjectKind === "USER") return null;
  if (!detail) return "Checking the membership… access can be assigned once it is confirmed.";

  const gate = detail.membership;
  const status = String(gate?.status ?? "").toUpperCase();
  if (membershipIsValid(gate)) return null;

  if (status === "EXPIRED") {
    return "This membership has expired. Renew it before assigning a card or door access.";
  }
  if (!gate || !status || status === "NONE") {
    return "No valid membership. Issue one before assigning a card or door access.";
  }
  const start = nextStart(detail, now);
  if (start) {
    const when = start.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
    return `This membership starts on ${when}. A card or door access can be assigned from that date.`;
  }
  return `This membership is ${status.toLowerCase()}, not active. Activate it before assigning a card or door access.`;
}
