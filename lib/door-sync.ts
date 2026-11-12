// What the Card Access page's automatic door-group sync should do when a member is opened. No imports
// at all, so it runs in the browser and under `node --experimental-strip-types` for tests
// (see lib/door-sync.test.mjs).
//
// Policy (grant-only while the membership is valid):
//   - valid membership: ADD the door groups the plan grants that the person is missing. Never remove
//     groups: opening a member must not silently cut access (extra groups may have been given by hand, or
//     the plan may simply never have had its door groups configured).
//   - valid membership but the plan grants no door groups: change nothing and say so, so the plan gets fixed.
//   - expired / pending / no membership: remove their door groups (this is what switches an expired member off).
//   - staff (USER) and people with no membership data: never touched. Staff access is set by hand.

interface GateLike {
  status?: string | null;
  valid?: boolean;
}

/** Same rule as membershipIsValid in lib/access-gate.ts (kept inline so this file has no imports). */
const isValid = (gate: GateLike) => gate.valid ?? String(gate.status ?? "").toUpperCase() === "ACTIVE";

export interface DoorSyncInput {
  subjectKind: string;
  /** The membership gate from the server; null/undefined when there is none (e.g. staff). */
  membership: (GateLike & { grantedDoorIds?: string[] | null }) | null | undefined;
  /** BioStar's current state for this person. */
  current: { exists: boolean; groupIds: string[] };
}

export type DoorSyncPlan =
  | { action: "none"; reason: "skip" | "in-sync" | "plan-unconfigured" | "nothing-to-revoke"; extras: boolean }
  | { action: "apply"; groups: string[]; added: string[]; removed: string[] };

const uniq = (a: string[]) => Array.from(new Set(a.map(String)));

export function planDoorSync(input: DoorSyncInput): DoorSyncPlan {
  // Staff have no memberships; their access is managed by hand. Same for anyone without membership data.
  if (input.subjectKind === "USER" || !input.membership) {
    return { action: "none", reason: "skip", extras: false };
  }

  const current = uniq(input.current.groupIds);
  const desired = uniq(input.membership.grantedDoorIds ?? []);

  if (isValid(input.membership)) {
    if (desired.length === 0) {
      return { action: "none", reason: "plan-unconfigured", extras: false };
    }
    const missing = desired.filter((g) => !current.includes(g));
    if (missing.length === 0) {
      return { action: "none", reason: "in-sync", extras: current.some((g) => !desired.includes(g)) };
    }
    return { action: "apply", groups: uniq([...current, ...missing]), added: missing, removed: [] };
  }

  // No valid membership: door access off.
  if (current.length === 0) {
    return { action: "none", reason: "nothing-to-revoke", extras: false };
  }
  return { action: "apply", groups: [], added: [], removed: current };
}
