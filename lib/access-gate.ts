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
}

/** Why new access can't be granted to this person, or null when it can. */
export function accessBlockReason(subjectKind: string, detail: DetailLike | null | undefined): string | null {
  if (subjectKind === "USER") return null;
  if (!detail) return "Checking the membership… access can be assigned once it is confirmed.";

  const gate = detail.membership;
  const status = String(gate?.status ?? "").toUpperCase();
  const valid = gate?.valid ?? status === "ACTIVE";
  if (valid) return null;

  if (status === "EXPIRED") {
    return "This membership has expired. Renew it before assigning a card or door access.";
  }
  if (!gate || !status || status === "NONE") {
    return "No valid membership. Issue one before assigning a card or door access.";
  }
  return `This membership is ${status.toLowerCase()}, not active. Activate it before assigning a card or door access.`;
}
