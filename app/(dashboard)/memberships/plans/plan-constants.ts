// Shared constants + helpers for the Membership Plans area.
// Mirrors the option sets used by site/src/app/admin/plans/* so the ported
// CRM screens stay field-for-field compatible with the backend.

export type PlanType = "ACADEMY" | "LEISURE" | "PERSONAL_TRAINING";

export interface PlanOption {
  value: string;
  label: string;
}

export const TYPE_LABELS: Record<PlanType, string> = {
  ACADEMY: "Academy",
  LEISURE: "Leisure",
  PERSONAL_TRAINING: "Personal Training",
};

/** Order in which type sections are rendered (also drives the filter tabs). */
export const TYPE_ORDER: PlanType[] = ["ACADEMY", "LEISURE"];

export const PLAN_TYPES: PlanOption[] = [
  { value: "ACADEMY", label: "Academy" },
  { value: "LEISURE", label: "Leisure" },
];

export const CATEGORIES: PlanOption[] = [
  { value: "academy-junior", label: "Academy — Junior" },
  { value: "academy-elite", label: "Academy — Elite" },
  { value: "performance-hub", label: "Performance Hub" },
  { value: "leisure-gym", label: "Leisure — Gym" },
  { value: "leisure-swim", label: "Leisure — Swim" },
  { value: "personal-training", label: "Personal Training" },
  { value: "other", label: "Other" },
];

export const CATEGORY_LABELS: Record<string, string> = {
  "academy-junior": "Academy Junior",
  "academy-elite": "Academy Elite",
  "performance-hub": "Performance Hub",
  "leisure-gym": "Leisure Gym",
  "leisure-swim": "Leisure Swim",
  "personal-training": "Personal Training",
  other: "Other",
};

export const BILLING_CYCLES: PlanOption[] = [
  { value: "one-time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi-annual", label: "Semi-annual" },
  { value: "annual", label: "Annual" },
  { value: "season", label: "Season" },
  { value: "per-session", label: "Per session" },
];

export const BILLING_LABELS: Record<string, string> = {
  "one-time": "One-time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  "semi-annual": "Semi-annual",
  annual: "Annual",
  season: "Season",
  "per-session": "Per session",
};

/** A plan as returned by the backend (loose — payloads are `any` in the api client). */
export interface Plan {
  id: string;
  name: string;
  description?: string | null;
  type?: PlanType | string | null;
  category?: string | null;
  price?: number | null;
  billingCycle?: string | null;
  durationDays?: number | null;
  /** Sub-day session length (minutes) — 60/90/120-minute pitch rentals. */
  durationMinutes?: number | null;
  registrationFee?: number | null;
  features?: string[] | null;
  isActive?: boolean;
  isPublic?: boolean;
  sortOrder?: number | null;
  color?: string | null;
  maxFreezeDays?: number | null;
  requiresAthlete?: boolean | null;
  /**
   * Family package: covers more than one person. Gates the "add family member"
   * UI on the members page, and makes covered dependents invoice at zero since
   * this package already paid for them.
   */
  isFamilyPlan?: boolean | null;
  /** BioStar access-group ids this plan grants — synced to members automatically. */
  accessDoorIds?: string[] | null;
  /** Mint a BioStar QR credential automatically when staff assign this plan. */
  issueQrOnAssign?: boolean | null;
}

export function formatSAR(n: number | string | null | undefined): string {
  const num = Number(n || 0);
  return `SAR ${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
