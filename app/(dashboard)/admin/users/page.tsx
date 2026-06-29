"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Pagination } from "@/components/shared/pagination";
import { usePermissions } from "@/components/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  UserAdd,
  Mail,
  Phone,
  Send,
  Edit,
  Trash,
  Shield,
  Users as UsersIcon,
} from "@/lib/icons";

// ─── Static option lists ──────────────────────────────────────────────────────

// Built-in enum roles (mirrors site/src/app/admin/users/page.js + backend Role enum).
const ROLES = [
  { value: "ADMIN", label: "Admin" },
  { value: "COACH", label: "Coach" },
  { value: "SALES", label: "Sales" },
  { value: "VIEWER", label: "Viewer" },
  { value: "MEMBER", label: "Member" },
  { value: "ATHLETE", label: "Athlete" },
  { value: "PARENT", label: "Parent" },
];

const STAFF_ROLES = ["ADMIN", "COACH", "SALES", "VIEWER"];
const APP_ROLES = ["MEMBER", "ATHLETE", "PARENT"];

// Segment tabs → backend `accountType` filter (staff vs app-users vs all).
const SEGMENTS = [
  { value: "ALL", label: "All", accountType: undefined },
  { value: "staff", label: "Staff", accountType: "staff" },
  { value: "app", label: "App Users", accountType: "app" },
] as const;

const ROLE_FILTERS = [
  { value: "ALL", label: "All roles" },
  ...ROLES,
];

const STATUS_FILTERS = [
  { value: "ALL", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "SUSPENDED", label: "Suspended" },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "SUSPENDED", label: "Suspended" },
];

// Sentinel for "no custom role" — base-ui Select can't use "" as an item value.
const NO_CUSTOM_ROLE = "__none";

const PAGE_SIZE = 20;

function roleBadgeClass(r?: string): string {
  switch (String(r || "").toUpperCase()) {
    case "ADMIN":
      return "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400";
    case "COACH":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
    case "SALES":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
    case "VIEWER":
      return "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400";
    case "MEMBER":
      return "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-400";
    case "ATHLETE":
      return "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400";
    case "PARENT":
      return "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400";
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

function statusBadgeClass(s?: string): string {
  switch (String(s || "").toUpperCase()) {
    case "ACTIVE":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
    case "SUSPENDED":
      return "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400";
    case "INACTIVE":
    default:
      return "bg-gray-500/10 text-gray-600 border-gray-500/30 dark:text-gray-400";
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name?: string, email?: string): string {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return base.slice(0, 1).toUpperCase();
}

interface AppUser {
  id: string;
  name?: string | null;
  email: string;
  phone?: string | null;
  role: string;
  status?: string | null;
  lastLogin?: string | null;
  customRole?: { id: string; name: string; slug: string } | null;
}

interface CustomRole {
  id: string;
  name: string;
  slug: string;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function UsersDirectoryPage() {
  const { can } = usePermissions();
  const canEdit = can("users:edit");
  const canDelete = can("users:delete");
  const canRowAction = canEdit || canDelete;

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);

  const [segment, setSegment] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [roleId, setRoleId] = useState<string>(NO_CUSTOM_ROLE); // ALL custom roles default

  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number } | null>(null);

  // Create/edit dialog
  const [editing, setEditing] = useState<AppUser | null | "new">(null);

  // Send-login confirm
  const [loginTarget, setLoginTarget] = useState<AppUser | null>(null);
  const [sendingLogin, setSendingLogin] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const accountType = SEGMENTS.find((s) => s.value === segment)?.accountType;
      const res = await api.users.list({
        accountType,
        role: role === "ALL" ? undefined : role,
        status: status === "ALL" ? undefined : status,
        roleId: roleId === NO_CUSTOM_ROLE ? undefined : roleId,
        search: q || undefined,
        page,
        limit: PAGE_SIZE,
      });
      const rows: AppUser[] = Array.isArray(res) ? res : res?.data || [];
      setUsers(rows);
      setMeta(Array.isArray(res) ? null : res?.meta ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [segment, role, status, roleId, q, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // Custom roles for the picker + filter (loaded once).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.roles.list();
        const rows: CustomRole[] = Array.isArray(res) ? res : res?.data || [];
        if (!cancelled) setRoles(rows);
      } catch {
        // Roles are optional — silently degrade to enum-only picker.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const staff = users.filter((u) => STAFF_ROLES.includes(String(u.role || "").toUpperCase())).length;
    const app = users.filter((u) => APP_ROLES.includes(String(u.role || "").toUpperCase())).length;
    return { ALL: users.length, staff, app };
  }, [users]);

  const hasFilters = q || role !== "ALL" || status !== "ALL" || roleId !== NO_CUSTOM_ROLE;

  const sendLogin = async () => {
    if (!loginTarget) return;
    setSendingLogin(true);
    try {
      await api.users.sendLogin(loginTarget.id);
      toast.success(`Login details sent to ${loginTarget.email}`);
      setLoginTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send login");
    } finally {
      setSendingLogin(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.users.delete(deleteTarget.id);
      toast.success(`${deleteTarget.name || deleteTarget.email} deleted`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Every Vision7 account — staff, coaches, sales, and the members, athletes and parents who log into the apps. Assign built-in or custom roles, manage status, and send login credentials."
        onRefresh={load}
        actions={
          <PermissionGate permission="users:create">
            <Button onClick={() => setEditing("new")}>
              <UserAdd className="h-4 w-4" />
              New User
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total users" value={loading ? "—" : (meta?.total ?? counts.ALL)} hue="navy" icon={<UsersIcon className="h-5 w-5" />} />
        <StatCard label="Staff" value={loading ? "—" : counts.staff} hue="yellow" icon={<Shield className="h-5 w-5" />} />
        <StatCard label="App users" value={loading ? "—" : counts.app} hue="emerald" icon={<UsersIcon className="h-5 w-5" />} />
      </div>

      {/* Segment tabs */}
      <Tabs value={segment} onValueChange={(v) => { setPage(1); setSegment((v as string) ?? "ALL"); }}>
        <TabsList>
          {SEGMENTS.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => { setPage(1); setQ(e.target.value); }}
                placeholder="Name, email, phone…"
                className="pl-9"
                aria-label="Search users"
              />
            </div>
            <Select items={ROLE_FILTERS} value={role} onValueChange={(v) => { setPage(1); setRole(v ?? "ALL"); }}>
              <SelectTrigger className="w-full lg:w-40" aria-label="Filter by role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_FILTERS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select items={STATUS_FILTERS} value={status} onValueChange={(v) => { setPage(1); setStatus(v ?? "ALL"); }}>
              <SelectTrigger className="w-full lg:w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roles.length > 0 && (
              <Select
                items={[{ value: NO_CUSTOM_ROLE, label: "All custom roles" }, ...roles.map((r) => ({ value: r.id, label: r.name }))]}
                value={roleId}
                onValueChange={(v) => { setPage(1); setRoleId(v ?? NO_CUSTOM_ROLE); }}
              >
                <SelectTrigger className="w-full lg:w-48" aria-label="Filter by custom role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CUSTOM_ROLE}>All custom roles</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <UsersIcon className="h-6 w-6" />
                        <p>
                          {hasFilters
                            ? "No users match your filters."
                            : "No users yet. Add staff or invite app users to get started."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-[10px] font-semibold">
                              {initials(u.name || undefined, u.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{u.name || "(no name)"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.customRole ? (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                            <Shield className="mr-1 h-3 w-3" />
                            {u.customRole.name}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={roleBadgeClass(u.role)}>
                            {u.role}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`mailto:${u.email}`}
                          className="inline-flex items-center gap-1.5 text-sm hover:text-primary"
                        >
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="max-w-[180px] truncate">{u.email}</span>
                        </a>
                      </TableCell>
                      <TableCell>
                        {u.phone ? (
                          <a
                            href={`tel:${u.phone}`}
                            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {u.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadgeClass(u.status || "ACTIVE")}>
                          {u.status || "ACTIVE"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(u.lastLogin)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <>
                              <Button
                                variant="outline"
                                size="icon-sm"
                                onClick={() => setLoginTarget(u)}
                                aria-label="Send login credentials"
                                title="Send login credentials"
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon-sm"
                                onClick={() => setEditing(u)}
                                aria-label="Edit user"
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {canDelete && (
                            <Button
                              variant="outline"
                              size="icon-sm"
                              onClick={() => setDeleteTarget(u)}
                              aria-label="Delete user"
                              title="Delete"
                            >
                              <Trash className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          {!canRowAction && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={meta?.total ?? users.length}
            totalPages={meta?.totalPages ?? 1}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <UserFormDialog
        key={editing === "new" ? "new" : editing?.id || "closed"}
        open={editing !== null}
        user={editing === "new" ? null : editing}
        roles={roles}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />

      {/* Send-login confirm */}
      <ConfirmDialog
        open={loginTarget !== null}
        onOpenChange={(o) => {
          if (!o) setLoginTarget(null);
        }}
        title="Send login credentials?"
        description={`This resets the password and emails fresh login details to ${
          loginTarget?.email || "this user"
        }.`}
        confirmLabel="Send"
        loading={sendingLogin}
        onConfirm={sendLogin}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title="Delete this user?"
        description={`${
          deleteTarget?.name || deleteTarget?.email || "This account"
        } will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

// ─── Create / edit dialog ───────────────────────────────────────────────────────

interface UserFormState {
  name: string;
  email: string;
  phone: string;
  role: string;
  roleId: string; // NO_CUSTOM_ROLE = none
  status: string;
  sendLogin: boolean;
}

function UserFormDialog({
  open,
  user,
  roles,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  user: AppUser | null;
  roles: CustomRole[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const [form, setForm] = useState<UserFormState>(() => ({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    role: user?.role || "VIEWER",
    roleId: user?.customRole?.id || NO_CUSTOM_ROLE,
    status: user?.status || "ACTIVE",
    sendLogin: !isEdit,
  }));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof UserFormState>(k: K, v: UserFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    setSaving(true);
    try {
      const roleId = form.roleId === NO_CUSTOM_ROLE ? null : form.roleId;
      if (isEdit && user) {
        await api.users.update(user.id, {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          roleId,
          status: form.status,
        });
        toast.success("User updated");
      } else {
        await api.users.create({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          role: form.role,
          roleId: roleId ?? undefined,
          status: form.status,
          sendLogin: form.sendLogin,
        });
        toast.success("User created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "New user"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this account's role, status and contact details."
              : "Create a staff or app-user account. Assign a built-in role or a custom role."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="user-name">Name</Label>
            <Input
              id="user-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Full name"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              className="font-mono"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="name@vision7.sa"
              disabled={isEdit}
              required
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Email cannot be changed after creation.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user-phone">Phone</Label>
            <Input
              id="user-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+966 5X XXX XXXX"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Built-in role</Label>
              <Select items={ROLES} value={form.role} onValueChange={(v) => set("role", v ?? "VIEWER")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                items={STATUS_OPTIONS}
                value={form.status}
                onValueChange={(v) => set("status", v ?? "ACTIVE")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-primary" />
              Custom role
            </Label>
            <Select
              items={[{ value: NO_CUSTOM_ROLE, label: "No custom role" }, ...roles.map((r) => ({ value: r.id, label: r.name }))]}
              value={form.roleId}
              onValueChange={(v) => set("roleId", v ?? NO_CUSTOM_ROLE)}
              disabled={roles.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No custom role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CUSTOM_ROLE}>No custom role</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {roles.length === 0
                ? "No custom roles defined yet — create them under Roles & Permissions."
                : "A custom role grants its own permission set, overriding the built-in role's defaults."}
            </p>
          </div>

          {!isEdit && (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md border bg-muted/20 p-3">
              <Checkbox
                checked={form.sendLogin}
                onCheckedChange={(v) => set("sendLogin", v === true)}
              />
              <span className="text-sm text-muted-foreground">
                Email login credentials to the new user (recommended)
              </span>
            </label>
          )}

          {isEdit && (
            <label className="flex cursor-pointer items-center justify-between rounded-md border bg-muted/20 p-3">
              <span className="text-sm">
                Account active
                <span className="ml-2 text-xs text-muted-foreground">
                  Inactive accounts cannot sign in.
                </span>
              </span>
              <Switch
                checked={form.status === "ACTIVE"}
                onCheckedChange={(v) => set("status", v ? "ACTIVE" : "INACTIVE")}
              />
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim() || !form.email.trim()}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
