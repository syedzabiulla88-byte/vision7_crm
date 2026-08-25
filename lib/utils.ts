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
