// ─── Permission helpers ───────────────────────────────────────────────────────
//
// Permissions are resolved server-side (PermissionsGuard + resolvePermissions in
// vision_backend) and returned on `GET /auth/profile` as `permissions: string[]`.
// The wildcard `'*'` (Administrator) grants everything. Client-side gating here is
// UX only — the backend remains the source of truth.

/** Business capability set that admits a user into the CRM control plane. */
export const BUSINESS_PERMISSIONS = [
  "crm:view",
  "enquiries:view",
  "followups:view",
  "members:view",
  "memberships:view",
  "bookings:view",
  "facilities:view",
  "tours:view",
  "invoices:view",
  "payments:view",
  "accounting:view",
  "reports:view",
  "users:view",
  "roles:manage",
  "settings:manage",
  "audit:view",
  "apps:view",
  "accesscontrol:view",
] as const;

/** Write actions on `mod` that imply `mod:view` (mirrors the backend shim). */
function writeActions(mod: string): string[] {
  return [`${mod}:create`, `${mod}:edit`, `${mod}:delete`, `${mod}:manage`, `${mod}:allocate`];
}

/**
 * True if `granted` satisfies `key`, mirroring the backend shim
 * (`hasPermissions` in vision_backend/src/common/rbac/permissions.ts) exactly:
 *   - `'*'` grants everything;
 *   - an exact `mod:action` grant matches;
 *   - a `mod:manage` grant satisfies `mod:create` / `mod:edit` / `mod:delete` / `mod:view`;
 *   - any write grant (create/edit/delete/manage/allocate) on a module implies `mod:view`.
 */
export function hasPermission(granted: string[] | undefined | null, key?: string | null): boolean {
  if (!key) return true; // ungated
  if (!granted || granted.length === 0) return false;
  if (granted.includes("*")) return true;
  const g = new Set(granted);
  if (g.has(key)) return true;
  const [mod, action] = key.split(":");
  if (!mod || !action) return false;
  if (g.has(`${mod}:manage`) && ["create", "edit", "delete", "view"].includes(action)) return true;
  if (action === "view" && writeActions(mod).some((k) => g.has(k))) return true;
  return false;
}

/** True if `granted` grants ANY of the given keys (applying the same shim rules). */
export function hasAnyPermission(granted: string[] | undefined | null, keys: readonly string[]): boolean {
  if (!granted || granted.length === 0) return false;
  if (granted.includes("*")) return true;
  return keys.some((k) => hasPermission(granted, k));
}

/**
 * Admission check for the CRM: accept anyone whose permissions include `'*'` or
 * intersect the business set. Rejects pure MEMBER/ATHLETE/PARENT (empty perms).
 */
export function canAccessCrm(perms: string[] | undefined | null): boolean {
  return hasAnyPermission(perms, BUSINESS_PERMISSIONS);
}
