// ─── Permission helpers ───────────────────────────────────────────────────────
//
// Permissions are resolved server-side (PermissionsGuard + resolvePermissions in
// vision_backend) and returned on `GET /auth/profile` as `permissions: string[]`.
// The wildcard `'*'` (Administrator) grants everything. Client-side gating here is
// UX only — the backend remains the source of truth.

/** Business capability set that admits a user into the CRM control plane. */
export const BUSINESS_PERMISSIONS = [
  "crm:view",
  "members:view",
  "memberships:view",
  "memberships:manage",
  "bookings:view",
  "facilities:manage",
  "invoices:view",
  "accounting:view",
  "reports:view",
  "users:view",
  "users:manage",
  "roles:manage",
  "settings:manage",
  "followups:view",
] as const;

/** True if `perms` grants `key` (honoring the `'*'` wildcard). */
export function hasPermission(perms: string[] | undefined | null, key?: string | null): boolean {
  if (!key) return true; // ungated
  if (!perms || perms.length === 0) return false;
  if (perms.includes("*")) return true;
  return perms.includes(key);
}

/** True if `perms` grants ANY of the given keys (or `'*'`). */
export function hasAnyPermission(perms: string[] | undefined | null, keys: readonly string[]): boolean {
  if (!perms || perms.length === 0) return false;
  if (perms.includes("*")) return true;
  return keys.some((k) => perms.includes(k));
}

/**
 * Admission check for the CRM: accept anyone whose permissions include `'*'` or
 * intersect the business set. Rejects pure MEMBER/ATHLETE/PARENT (empty perms).
 */
export function canAccessCrm(perms: string[] | undefined | null): boolean {
  return hasAnyPermission(perms, BUSINESS_PERMISSIONS);
}
