"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { hasPermission, hasAnyPermission } from "@/lib/auth/permissions";

/**
 * Convenience hook over the current user's resolved permissions.
 * Client gating is UX only — the backend still enforces every request.
 */
export function usePermissions() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  return {
    permissions,
    isAdmin: permissions.includes("*"),
    can: (key?: string | null) => hasPermission(permissions, key),
    canAny: (keys: readonly string[]) => hasAnyPermission(permissions, keys),
  };
}
