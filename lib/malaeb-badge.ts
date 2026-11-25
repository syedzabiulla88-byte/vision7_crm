// How a booking relates to the Malaeb marketplace, for the Bookings screen. No imports so it runs
// under `node --experimental-strip-types` for tests. The backend sets Booking.externalSource.
export interface MalaebBadge {
  label: string;
  title: string;
  tone: "ok" | "warn" | "muted";
}

export function malaebBadge(b: { externalSource?: string | null }): MalaebBadge | null {
  switch (String(b.externalSource ?? "")) {
    case "malaeb":
      return { label: "On Malaeb", title: "This time is held on Malaeb, so it cannot be sold there.", tone: "ok" };
    case "malaeb-conflict":
      return {
        label: "Malaeb clash",
        title: "Malaeb already had a booking at this time. Contact one of the two customers.",
        tone: "warn",
      };
    case "malaeb-cancelled":
      return { label: "Released on Malaeb", title: "Cancelled here and released on Malaeb.", tone: "muted" };
    default:
      return null;
  }
}

export const MALAEB_TONE_CLASS: Record<MalaebBadge["tone"], string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  muted: "border-border bg-muted/40 text-muted-foreground",
};
