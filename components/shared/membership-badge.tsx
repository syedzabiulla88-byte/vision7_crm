"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export interface MembershipBadgeProps {
  athleteId: string;
  /** If already fetched by the parent, pass it to skip the API call */
  membership?: any | null;
  /** Compact display (just dot + short label) */
  compact?: boolean;
  className?: string;
}

type Status = "active" | "pending" | "expired" | "suspended" | "cancelled" | "none";

function statusOf(m: any): Status {
  if (!m) return "none";
  const s = String(m.status || "").toUpperCase();
  // Treat past-endDate active memberships as expired
  if (s === "ACTIVE" && m.endDate && new Date(m.endDate) < new Date()) return "expired";
  if (s === "ACTIVE") return "active";
  if (s === "PENDING") return "pending";
  if (s === "EXPIRED") return "expired";
  if (s === "SUSPENDED") return "suspended";
  if (s === "CANCELLED") return "cancelled";
  return "none";
}

const STATUS_STYLES: Record<Status, { label: string; dot: string; classes: string }> = {
  active:    { label: "Active",    dot: "bg-green-500",   classes: "bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400" },
  pending:   { label: "Pending",   dot: "bg-amber-500",   classes: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400" },
  expired:   { label: "Expired",   dot: "bg-red-500",     classes: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400" },
  suspended: { label: "Suspended", dot: "bg-gray-400",    classes: "bg-gray-500/10 text-gray-600 border-gray-500/30 dark:text-gray-400" },
  cancelled: { label: "Cancelled", dot: "bg-gray-400",    classes: "bg-gray-500/10 text-gray-600 border-gray-500/30 dark:text-gray-400" },
  none:      { label: "No plan",   dot: "bg-muted-foreground/40", classes: "bg-muted/30 text-muted-foreground border-border" },
};

/**
 * Displays the membership status for a given athlete.
 * - `membership` prop can be passed (for list views where parent batched the fetch).
 * - Otherwise makes a single `api.memberships.currentForAthlete(id)` call.
 */
export function MembershipBadge({ athleteId, membership: membershipProp, compact, className }: MembershipBadgeProps) {
  const [loaded, setLoaded] = useState<any | null | undefined>(
    membershipProp === undefined ? undefined : membershipProp,
  );

  useEffect(() => {
    if (membershipProp !== undefined) { setLoaded(membershipProp); return; }
    let cancelled = false;
    api.memberships.currentForAthlete(athleteId)
      .then(m => { if (!cancelled) setLoaded(m || null); })
      .catch(() => { if (!cancelled) setLoaded(null); });
    return () => { cancelled = true; };
  }, [athleteId, membershipProp]);

  if (loaded === undefined) {
    return <div className={cn("inline-block h-5 w-14 bg-muted/40 animate-pulse rounded", className)} />;
  }

  const status = statusOf(loaded);
  const style = STATUS_STYLES[status];
  const planName = loaded?.plan?.name || null;

  if (compact) {
    return (
      <span
        title={planName ? `${style.label} — ${planName}` : style.label}
        className={cn("inline-flex items-center gap-1.5", className)}
      >
        <span className={cn("w-2 h-2 rounded-full", style.dot)} />
        <span className="text-[10px] font-medium">{style.label}</span>
      </span>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium gap-1.5", style.classes, className)}
      title={planName ? `${style.label} — ${planName}` : style.label}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} />
      {planName ? `${style.label}: ${planName}` : style.label}
    </Badge>
  );
}
