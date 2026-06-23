// CRM control-plane navigation — defined as data, rendered by the sidebar.
// Every item is permission-gated off the backend's `module:action` keys (filtered
// against `permissions[]` from /auth/profile). `permission` undefined = ungated.
// See CRM_HUB_PLAN.md §2 for the canonical 7-group IA.

import { hasPermission } from "@/lib/auth/permissions";

export interface NavItem {
  label: string;
  href: string;
  /** Lucide icon name (resolved in the sidebar via @/lib/icons). */
  icon: string;
  /** Required permission key. Undefined = visible to every admitted user. */
  permission?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/", icon: "LayoutGrid" }],
  },
  {
    label: "Sales & CRM",
    items: [
      { label: "Contacts", href: "/crm", icon: "Users", permission: "crm:view" },
      { label: "Pipeline", href: "/crm/board", icon: "Layers", permission: "crm:view" },
      { label: "Follow-ups", href: "/crm/followups", icon: "ClipboardCheck", permission: "followups:view" },
      { label: "Duplicates", href: "/admin/duplicates", icon: "Users", permission: "crm:view" },
    ],
  },
  {
    label: "Memberships",
    items: [
      { label: "Members", href: "/members", icon: "UsersMultiple", permission: "memberships:view" },
      { label: "Plans", href: "/memberships/plans", icon: "Award", permission: "memberships:manage" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Bookings", href: "/bookings", icon: "Calendar", permission: "bookings:view" },
      { label: "Facilities", href: "/facilities", icon: "MapPin", permission: "facilities:manage" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Invoices", href: "/billing/invoices", icon: "FileText", permission: "invoices:view" },
      { label: "Accounting", href: "/billing/accounting", icon: "Chart", permission: "accounting:view" },
    ],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", href: "/reports", icon: "TrendUp", permission: "reports:view" }],
  },
  {
    label: "Control Plane",
    items: [
      { label: "Users", href: "/admin/users", icon: "ShieldUser", permission: "users:view" },
      { label: "Roles & Permissions", href: "/admin/roles", icon: "Shield", permission: "roles:manage" },
      { label: "System Settings", href: "/admin/settings", icon: "Settings", permission: "settings:manage" },
      { label: "Connected Apps", href: "/admin/apps", icon: "Layers", permission: "settings:manage" },
    ],
  },
];

/** Returns the nav groups with items filtered by the user's permissions; drops empty groups. */
export function navForPermissions(perms: string[] | undefined | null): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasPermission(perms, item.permission)),
  })).filter((group) => group.items.length > 0);
}
