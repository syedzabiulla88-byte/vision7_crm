"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

interface Permission {
  key: string;
  label?: string;
  group?: string;
}

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
      permission="users:manage"
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

  // Group permissions by their `group` field, preserving first-seen order.
  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions) {
      const g = p.group || "Other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    }
    return Array.from(map.entries()).map(([group, perms]) => ({ group, perms }));
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

  const toggleGroup = (perms: Permission[], allOn: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (allOn) next.delete(p.key);
        else next.add(p.key);
      }
      return next;
    });
  };

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

              {groups.length === 0 ? (
                <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                  No permissions available.
                </p>
              ) : (
                <div className="space-y-3">
                  {groups.map(({ group, perms }) => {
                    const allOn = perms.every((p) => selected.has(p.key));
                    return (
                      <div key={group} className="overflow-hidden rounded-md border border-border">
                        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {group}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto py-1 text-xs"
                            onClick={() => toggleGroup(perms, allOn)}
                          >
                            {allOn ? "Clear all" : "Select all"}
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-2">
                          {perms.map((p) => {
                            const on = selected.has(p.key);
                            const inputId = `perm-${p.key}`;
                            return (
                              <label
                                key={p.key}
                                htmlFor={inputId}
                                className={
                                  "flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors " +
                                  (on
                                    ? "border-primary/40 bg-primary/5"
                                    : "border-transparent hover:bg-muted/50")
                                }
                              >
                                <Checkbox
                                  id={inputId}
                                  checked={on}
                                  onCheckedChange={() => toggle(p.key)}
                                />
                                <span className="text-sm leading-tight">{p.label || p.key}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
