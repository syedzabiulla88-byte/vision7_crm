"use client";

import { ReactNode } from "react";
import { usePermissions } from "@/components/hooks/use-permissions";

interface PermissionGateProps {
  /** Required permission key. Honors the `'*'` wildcard. */
  permission?: string;
  /** Or require ANY of these keys. */
  anyOf?: readonly string[];
  children: ReactNode;
  /** Rendered when the user lacks the permission (default: nothing). */
  fallback?: ReactNode;
}

/**
 * Hides children unless the current user has the required permission(s).
 * Client gating is UX only — the backend remains the source of truth.
 */
export function PermissionGate({ permission, anyOf, children, fallback = null }: PermissionGateProps) {
  const { can, canAny } = usePermissions();
  const allowed = anyOf ? canAny(anyOf) : can(permission);
  return <>{allowed ? children : fallback}</>;
}
