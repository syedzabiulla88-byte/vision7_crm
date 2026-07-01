"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Edit,
  Trash,
  Shield,
  ShieldUser,
  Save,
} from "@/lib/icons";

// ─── Types ──────────────────────────────────────────────────────────────────────

type PermAction = "view" | "create" | "edit" | "delete" | "manage" | "use" | "allocate" | "revenue";

interface Permission {
  key: string;
  label?: string;
  group?: string;
  module?: string;
  action?: PermAction;
}

// Column order for the matrix. The four CRUD actions get fixed leading columns;
// any module-specific extras (manage/use/allocate) follow, in this order.
const PRIMARY_ACTIONS: PermAction[] = ["view", "create", "edit", "delete"];
const EXTRA_ACTIONS: PermAction[] = ["manage", "use", "allocate", "revenue"];
const ACTION_LABEL: Record<PermAction, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  manage: "Manage",
  use: "Use",
  allocate: "Allocate",
  revenue: "Revenue",
};

// The 'dashboard' module is rendered as its own "Dashboard cards" panel rather
// than a row in the action matrix — each key is a standalone toggle. Keep it out
// of the matrix (both its rows and its extra columns) so the card actions don't
// spawn sparse columns. `dashboard:view` leads; the six card keys follow.
const DASHBOARD_MODULE = "dashboard";
const DASHBOARD_KEY_ORDER = [
  "dashboard:view",
  "dashboard:revenue",
  "dashboard:memberships",
  "dashboard:pipeline",
  "dashboard:bookings",
  "dashboard:followups",
  "dashboard:club",
];
// Helper text under each card so admins know what else to grant for the
// jump-to button to appear for the role's users.
const DASHBOARD_HINTS: Record<string, string> = {
  "dashboard:view": "Lets the role open the dashboard page",
  "dashboard:revenue": "Opens billing (needs Invoices access)",
  "dashboard:memberships": "needs Members access",
  "dashboard:pipeline": "needs CRM access",
  "dashboard:bookings": "needs Bookings access",
  "dashboard:followups": "needs Follow-ups access",
  "dashboard:club": "needs Teams access",
};

interface Role {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  isSystem?: boolean;
  permissions?: string[];
  userCount?: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // null = closed, "new" = create form, Role = edit form
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, p] = await Promise.all([api.roles.list(), api.roles.permissions()]);
      const rows: Role[] = Array.isArray(r) ? r : r?.data ?? [];
      const perms: Permission[] = Array.isArray(p) ? p : p?.permissions ?? [];
      setRoles(rows);
      setPermissions(perms);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load roles";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.roles.delete(toDelete.id);
      toast.success(`Deleted the "${toDelete.name}" role`);
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete role");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PermissionGate
      permission="roles:manage"
      fallback={
        <EmptyState
          icon={<Shield className="h-6 w-6 text-muted-foreground" />}
          title="No access"
          description="You don't have permission to manage roles and permissions."
        />
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Roles & Permissions"
          description="Define custom roles and pick exactly which areas of the control plane each one can access. System roles are built in — you can review their permissions but can't rename or delete them."
          onRefresh={load}
          actions={
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              Create role
            </Button>
          }
        />

        {loading ? (
          <Card>
            <CardContent className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : error ? (
          <EmptyState
            icon={<Shield className="h-6 w-6 text-muted-foreground" />}
            title="Could not load roles"
            description={error}
            action={{ label: "Retry", onClick: () => load() }}
          />
        ) : roles.length === 0 ? (
          <EmptyState
            icon={<ShieldUser className="h-6 w-6 text-muted-foreground" />}
            title="No roles yet"
            description="Create your first custom role to control who can access which parts of the platform."
            action={{ label: "Create a role", onClick: () => setEditing("new") }}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Permissions</TableHead>
                      <TableHead className="text-center">Users</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((role) => {
                      const wildcard = role.permissions?.includes("*");
                      const count = wildcard ? "All" : role.permissions?.length ?? 0;
                      return (
                        <TableRow key={role.id}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFCF01]/15 text-[#FFCF01]">
                                <ShieldUser className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium">{role.name}</p>
                                {role.slug && (
                                  <p className="font-mono text-xs text-muted-foreground">{role.slug}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs text-sm text-muted-foreground">
                            {role.description || "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{count} granted</Badge>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {role.userCount ?? 0}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setEditing(role)}
                                aria-label={role.isSystem ? `View ${role.name}` : `Edit ${role.name}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setToDelete(role)}
                                disabled={role.isSystem}
                                aria-label={
                                  role.isSystem
                                    ? "System roles cannot be deleted"
                                    : `Delete ${role.name}`
                                }
                                title={role.isSystem ? "System roles cannot be deleted" : undefined}
                              >
                                <Trash className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {editing && (
          <RoleFormDialog
            role={editing === "new" ? null : editing}
            permissions={permissions}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}

        <ConfirmDialog
          open={!!toDelete}
          onOpenChange={(open) => !open && setToDelete(null)}
          title="Delete role"
          description={
            toDelete
              ? `Delete the "${toDelete.name}" role? This cannot be undone. Users assigned to it will lose its permissions.`
              : ""
          }
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={confirmDelete}
        />
      </div>
    </PermissionGate>
  );
}

// ─── Role form dialog ─────────────────────────────────────────────────────────────

function RoleFormDialog({
  role,
  permissions,
  onClose,
  onSaved,
}: {
  role: Role | null;
  permissions: Permission[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!role;
  const isSystem = !!role?.isSystem;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [saving, setSaving] = useState(false);

  // Build the module × action matrix. Each catalog entry is keyed `module:action`.
  // We collapse entries into one ROW per module (carrying its label + the set of
  // actions it exposes), grouped by `group`, preserving first-seen order. The
  // union of action columns to render is derived from what modules actually use.
  const { matrixGroups, columns, allKeys, dashboardCards } = useMemo(() => {
    const groupMap = new Map<
      string,
      Map<string, { module: string; label: string; actions: Map<PermAction, string> }>
    >();
    const usedExtras = new Set<PermAction>();
    const keys: string[] = [];
    // The dashboard module's catalog entries, keyed by permission key so we can
    // present them in the fixed contract order regardless of catalog ordering.
    const dashByKey = new Map<string, Permission>();

    for (const p of permissions) {
      const action = (p.action ?? (p.key.split(":")[1] as PermAction)) as PermAction | undefined;
      const moduleKey = p.module ?? p.key.split(":")[0];
      if (!action || !moduleKey) continue;

      // Pull the dashboard module out of the matrix entirely — it renders as its
      // own panel, and its card actions must not contribute to matrix columns
      // (usedExtras) or rows.
      if (moduleKey === DASHBOARD_MODULE) {
        dashByKey.set(p.key, p);
        continue;
      }

      keys.push(p.key);
      if (EXTRA_ACTIONS.includes(action)) usedExtras.add(action);

      const groupName = p.group || "Other";
      if (!groupMap.has(groupName)) groupMap.set(groupName, new Map());
      const mods = groupMap.get(groupName)!;
      if (!mods.has(moduleKey)) {
        // Derive a clean module label by stripping the action word from the
        // catalog label (e.g. "View CRM Contacts" → "CRM Contacts").
        const actionWord = ACTION_LABEL[action];
        const derived =
          p.label && actionWord && p.label.startsWith(actionWord + " ")
            ? p.label.slice(actionWord.length + 1)
            : p.label || moduleKey;
        mods.set(moduleKey, { module: moduleKey, label: derived, actions: new Map() });
      }
      mods.get(moduleKey)!.actions.set(action, p.key);
    }

    const cols: PermAction[] = [
      ...PRIMARY_ACTIONS,
      ...EXTRA_ACTIONS.filter((a) => usedExtras.has(a)),
    ];
    const groups = Array.from(groupMap.entries()).map(([group, mods]) => ({
      group,
      modules: Array.from(mods.values()),
    }));

    // Order the dashboard cards by the fixed contract; append any unexpected
    // future dashboard keys after, so nothing silently disappears.
    const ordered: Permission[] = [];
    for (const key of DASHBOARD_KEY_ORDER) {
      const entry = dashByKey.get(key);
      if (entry) {
        ordered.push(entry);
        dashByKey.delete(key);
      }
    }
    for (const entry of dashByKey.values()) ordered.push(entry);

    return { matrixGroups: groups, columns: cols, allKeys: keys, dashboardCards: ordered };
  }, [permissions]);

  // A role holding the '*' wildcard has everything — surface that, but the
  // matrix toggles individual keys (the backend treats '*' as all).
  const hasWildcard = selected.has("*");

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Add (on=true) or remove (on=false) a batch of keys at once — used by the
  // per-row select-all and the matrix-wide header select-all.
  const setKeys = (keys: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  // Whole-matrix select-all state (tri-state).
  const allCount = allKeys.filter((k) => selected.has(k)).length;
  const allChecked = allKeys.length > 0 && allCount === allKeys.length;
  const someChecked = allCount > 0 && !allChecked;

  // Dashboard-cards panel select-all state (tri-state), independent of the matrix.
  const dashKeys = dashboardCards.map((c) => c.key);
  const dashCount = dashKeys.filter((k) => selected.has(k)).length;
  const dashAllChecked = dashKeys.length > 0 && dashCount === dashKeys.length;
  const dashSomeChecked = dashCount > 0 && !dashAllChecked;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSystem && !name.trim()) {
      toast.error("Role name is required");
      return;
    }
    setSaving(true);
    try {
      const perms = Array.from(selected);
      if (isEdit && role) {
        await api.roles.update(role.id, {
          // System roles keep their name/description; only permissions are editable.
          name: isSystem ? role.name : name.trim(),
          description: isSystem ? role.description : description.trim() || null,
          permissions: perms,
        });
        toast.success("Role updated");
      } else {
        await api.roles.create({
          name: name.trim(),
          description: description.trim() || undefined,
          permissions: perms,
        });
        toast.success("Role created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  // Count granted, ignoring the '*' meta-key in the visible tally.
  const grantedCount = useMemo(
    () => Array.from(selected).filter((k) => k !== "*").length,
    [selected],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border p-6">
          <DialogTitle>
            {isEdit ? (isSystem ? "System role" : "Edit role") : "New role"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? isSystem
                ? "Built-in role — review its permissions below. Name and description are fixed."
                : role?.name
              : "Define a custom role and pick which areas of the control plane it can access."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex max-h-[calc(90vh-9rem)] flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Name" htmlFor="role-name" required={!isSystem}>
                <Input
                  id="role-name"
                  required={!isSystem}
                  value={isSystem ? role!.name : name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSystem}
                  placeholder="e.g. Front Desk"
                />
              </FormField>
              <FormField label="Description" htmlFor="role-desc">
                <Input
                  id="role-desc"
                  value={isSystem ? role?.description ?? "" : description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSystem}
                  placeholder="What can this role do?"
                />
              </FormField>
            </div>

            {hasWildcard && (
              <div className="rounded-md border border-[#FFCF01]/30 bg-[#FFCF01]/5 p-3 text-sm">
                This role holds the <code className="font-mono">*</code> wildcard — it grants
                <strong> every</strong> permission, present and future, regardless of the boxes
                ticked below.
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Permissions</Label>
                <span className="text-xs text-muted-foreground">{grantedCount} selected</span>
              </div>

              {matrixGroups.length === 0 ? (
                <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                  No permissions available.
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border border-border">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="w-[40%] min-w-[10rem]">
                            <div className="flex items-center gap-2.5">
                              <Checkbox
                                aria-label="Select all permissions"
                                checked={allChecked}
                                indeterminate={someChecked}
                                onCheckedChange={() => setKeys(allKeys, !allChecked)}
                              />
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Module
                              </span>
                            </div>
                          </TableHead>
                          {columns.map((a) => (
                            <TableHead key={a} className="text-center text-xs font-medium">
                              {ACTION_LABEL[a]}
                            </TableHead>
                          ))}
                          <TableHead className="w-px text-center text-xs font-medium">All</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {matrixGroups.map(({ group, modules }) => (
                          <Fragment key={group}>
                            <TableRow className="hover:bg-transparent">
                              <TableCell
                                colSpan={columns.length + 2}
                                className="bg-muted/20 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                {group}
                              </TableCell>
                            </TableRow>
                            {modules.map((mod) => {
                              const rowKeys = Array.from(mod.actions.values());
                              const rowOn = rowKeys.filter((k) => selected.has(k)).length;
                              const rowAll = rowOn === rowKeys.length;
                              const rowSome = rowOn > 0 && !rowAll;
                              return (
                                <TableRow key={mod.module}>
                                  <TableCell className="font-medium">
                                    {mod.label}
                                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                                      {mod.module}
                                    </span>
                                  </TableCell>
                                  {columns.map((a) => {
                                    const key = mod.actions.get(a);
                                    if (!key) {
                                      return (
                                        <TableCell key={a} className="text-center text-muted-foreground/30">
                                          —
                                        </TableCell>
                                      );
                                    }
                                    const on = selected.has(key);
                                    return (
                                      <TableCell key={a} className="text-center">
                                        <div className="flex justify-center">
                                          <Checkbox
                                            aria-label={`${ACTION_LABEL[a]} ${mod.label}`}
                                            checked={on}
                                            onCheckedChange={() => toggle(key)}
                                          />
                                        </div>
                                      </TableCell>
                                    );
                                  })}
                                  <TableCell className="text-center">
                                    <div className="flex justify-center">
                                      <Checkbox
                                        aria-label={`Select all for ${mod.label}`}
                                        checked={rowAll}
                                        indeterminate={rowSome}
                                        onCheckedChange={() => setKeys(rowKeys, !rowAll)}
                                      />
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>

            {dashboardCards.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Dashboard cards</Label>
                  <span className="text-xs text-muted-foreground">
                    {dashCount} of {dashKeys.length} selected
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pick which cards this role sees on the dashboard. Each card needs the
                  related module access below for its &ldquo;open&rdquo; shortcut to appear.
                </p>

                <div className="overflow-hidden rounded-md border border-border">
                  <label className="flex cursor-pointer items-center gap-2.5 border-b border-border bg-muted/40 px-3 py-2.5">
                    <Checkbox
                      aria-label="Select all dashboard cards"
                      checked={dashAllChecked}
                      indeterminate={dashSomeChecked}
                      onCheckedChange={() => setKeys(dashKeys, !dashAllChecked)}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Select all cards
                    </span>
                  </label>

                  <div className="divide-y divide-border">
                    {dashboardCards.map((card) => {
                      const on = selected.has(card.key);
                      const hint = DASHBOARD_HINTS[card.key];
                      return (
                        <label
                          key={card.key}
                          className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 hover:bg-muted/30"
                        >
                          <Checkbox
                            className="mt-0.5"
                            aria-label={card.label ?? card.key}
                            checked={on}
                            onCheckedChange={() => toggle(card.key)}
                          />
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium">
                                {card.label ?? card.key}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {card.key}
                              </span>
                            </div>
                            {hint && (
                              <p className="text-xs text-muted-foreground">{hint}</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border p-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Small form helper ──────────────────────────────────────────────────────────

function FormField({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
