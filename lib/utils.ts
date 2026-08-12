import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Human-facing customer reference: crn 42 -> "CRN-00042". */
export function formatCrn(crn?: number | null): string {
  return crn == null ? "" : `CRN-${String(crn).padStart(5, "0")}`;
}
