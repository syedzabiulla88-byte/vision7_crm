"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users as UsersIcon,
  Phone,
  Mail,
  Check,
  Copy,
  Chat,
  Calendar,
  FileText,
} from "@/lib/icons";

// ─── Shapes (mirrors api.crm.duplicates() contract) ─────────────────────────────

interface DupContact {
  id: string;
  firstName?: string;
  lastName?: string | null;
  email?: string;
  phone?: string | null;
  type?: string;
  enquiryCount?: number;
  _count?: {
    activities?: number;
    bookings?: number;
    invoices?: number;
    followUps?: number;
  };
}

interface DupGroup {
  phone: string;
  contacts: DupContact[];
}

function fullName(c: DupContact): string {
  const name = `${c.firstName || ""} ${c.lastName || ""}`.trim();
  return name || c.email || "(no name)";
}

function typeBadgeClass(t?: string): string {
  switch (String(t || "").toUpperCase()) {
    case "LEAD":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
    case "CUSTOMER":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
    case "MEMBER":
      return "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400";
    case "FORMER":
      return "bg-gray-500/10 text-gray-600 border-gray-500/30 dark:text-gray-400";
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

export default function DuplicatesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<DupGroup[]>([]);

  // Per-group chosen primary (target) contact id.
  const [primaries, setPrimaries] = useState<Record<string, string>>({});

  // Pending merge confirmation: which source into which target (within a group).
  const [mergePending, setMergePending] = useState<{
    group: DupGroup;
    target: DupContact;
    source: DupContact;
  } | null>(null);
  const [merging, setMerging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.crm.duplicates();
      const rows: DupGroup[] = Array.isArray(res) ? res : res?.data || [];
      setGroups(rows);
      // Default each group's primary to the first contact.
      setPrimaries((prev) => {
        const next: Record<string, string> = {};
        for (const g of rows) {
          const existing = prev[g.phone];
          const stillValid = existing && g.contacts.some((c) => c.id === existing);
          next[g.phone] = stillValid ? existing : g.contacts[0]?.id;
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load duplicates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runMerge = async () => {
    if (!mergePending) return;
    const { target, source } = mergePending;
    setMerging(true);
    try {
      await api.crm.merge(target.id, source.id);
      toast.success(`Merged ${fullName(source)} into ${fullName(target)}`);
      setMergePending(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to merge contacts");
    } finally {
      setMerging(false);
    }
  };

  return (
    <PermissionGate
      permission="crm:view"
      fallback={
        <div className="space-y-6">
          <PageHeader title="Duplicate contacts" description="Find and merge contacts that share a phone number." />
          <EmptyState
            icon={<Copy className="h-6 w-6 text-muted-foreground" />}
            title="Access restricted"
            description="You don't have permission to manage duplicate contacts."
          />
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Duplicate contacts"
          description="People who share a phone number are likely the same person entered twice. Pick the contact to keep (the primary), then merge the others into it — their activities, bookings and invoices move across."
          onRefresh={load}
        />

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-48" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {Array.from({ length: 2 }).map((__, j) => (
                    <Skeleton key={j} className="h-16 w-full" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<Copy className="h-6 w-6 text-destructive" />}
            title="Couldn't load duplicates"
            description={error}
            action={{ label: "Try again", onClick: () => load() }}
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Check className="h-6 w-6 text-muted-foreground" />}
            title="No duplicates found"
            description="No two contacts share a phone number. Your CRM is clean."
          />
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const targetId = primaries[group.phone] ?? group.contacts[0]?.id;
              return (
                <Card key={group.phone}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {group.phone}
                      <Badge variant="outline" className="ml-1">
                        {group.contacts.length} contacts
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Select the primary contact to keep, then merge the rest into it.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {group.contacts.map((c) => {
                      const isPrimary = c.id === targetId;
                      const enquiries = c.enquiryCount ?? 0;
                      const activities = c._count?.activities ?? 0;
                      const bookings = c._count?.bookings ?? 0;
                      const invoices = c._count?.invoices ?? 0;
                      const target = group.contacts.find((g) => g.id === targetId);
                      return (
                        <div
                          key={c.id}
                          className={
                            "flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between " +
                            (isPrimary ? "border-primary/50 bg-primary/5" : "")
                          }
                        >
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{fullName(c)}</span>
                              <Badge variant="outline" className={typeBadgeClass(c.type)}>
                                {c.type || "—"}
                              </Badge>
                              {isPrimary && (
                                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                                  <Check className="mr-1 h-3 w-3" />
                                  Primary
                                </Badge>
                              )}
                              {enquiries > 0 && (
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400">
                                  {enquiries} {enquiries === 1 ? "enquiry" : "enquiries"}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {c.email && (
                                <span className="inline-flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  <span className="max-w-[200px] truncate">{c.email}</span>
                                </span>
                              )}
                              {c.phone && (
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {c.phone}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1">
                                <Chat className="h-3 w-3" />
                                {activities} activit{activities === 1 ? "y" : "ies"}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {bookings} booking{bookings === 1 ? "" : "s"}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {invoices} invoice{invoices === 1 ? "" : "s"}
                              </span>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {isPrimary ? (
                              <span className="text-xs text-muted-foreground">Kept</span>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setPrimaries((p) => ({ ...p, [group.phone]: c.id }))
                                  }
                                >
                                  Make primary
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    target &&
                                    setMergePending({ group, target, source: c })
                                  }
                                >
                                  <Copy className="h-4 w-4" />
                                  Merge into primary
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <ConfirmDialog
          open={mergePending !== null}
          onOpenChange={(o) => {
            if (!o) setMergePending(null);
          }}
          title="Merge contacts?"
          description={
            mergePending
              ? `Merge ${fullName(mergePending.source)} into ${fullName(
                  mergePending.target,
                )}? Activities, bookings and invoices move to ${fullName(
                  mergePending.target,
                )} and ${fullName(mergePending.source)} is deleted.`
              : ""
          }
          confirmLabel="Merge"
          variant="destructive"
          loading={merging}
          onConfirm={runMerge}
        />
      </div>
    </PermissionGate>
  );
}
