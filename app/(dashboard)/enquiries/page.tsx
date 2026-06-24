"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PermissionGate } from "@/components/shared/permission-gate";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  ClipboardCheck,
  Warning,
  Mail,
  Phone,
  ArrowRight,
  UserAdd,
  Folder as Archive,
} from "@/lib/icons";

// ─── Types (mirror the live backend contract) ────────────────────────────────────

type EnquiryStatus = "NEW" | "CONVERTED" | "ARCHIVED";

interface Enquiry {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  source: string;
  interest: string;
  status: EnquiryStatus;
  contactId: string | null;
  createdAt: string;
  matchedContact: { id: string; name: string } | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const TABS: { value: EnquiryStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "CONVERTED", label: "Converted" },
  { value: "ARCHIVED", label: "Archived" },
];

const STATUS_BADGE: Record<EnquiryStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  NEW: { label: "New", variant: "default" },
  CONVERTED: { label: "Converted", variant: "secondary" },
  ARCHIVED: { label: "Archived", variant: "outline" },
};

const EMPTY_TITLE: Record<EnquiryStatus, string> = {
  NEW: "No new enquiries",
  CONVERTED: "No converted enquiries",
  ARCHIVED: "No archived enquiries",
};

const EMPTY_DESC: Record<EnquiryStatus, string> = {
  NEW: "New enquiries from the website and other channels will land here.",
  CONVERTED: "Enquiries you turn into contacts will show up here.",
  ARCHIVED: "Enquiries you archive will be kept here for reference.",
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fullName(e: Enquiry): string {
  return `${e.firstName || ""} ${e.lastName || ""}`.trim() || "(no name)";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function truncate(text: string, max = 80): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd() + "…";
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function EnquiriesPage() {
  const router = useRouter();

  const [status, setStatus] = useState<EnquiryStatus>("NEW");
  const [items, setItems] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCount, setNewCount] = useState<number | null>(null);

  const [converting, setConverting] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<Enquiry | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.crm.enquiries({ status });
      const list: Enquiry[] = Array.isArray(res) ? res : res?.data ?? [];
      setItems(list);
    } catch (e) {
      const msg = errMsg(e, "Failed to load enquiries");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  // NEW-count badge on the tab — best-effort, never blocks the list.
  const loadNewCount = useCallback(() => {
    api.crm
      .overview()
      .then((o) => setNewCount(typeof o?.newEnquiries === "number" ? o.newEnquiries : null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadNewCount();
  }, [loadNewCount]);

  // ── Actions ────────────────────────────────────────────────────────────────────

  const convert = async (e: Enquiry) => {
    setConverting(e.id);
    try {
      const res = await api.crm.convertEnquiry(e.id);
      const contactId = res?.contactId;
      if (!contactId) throw new Error("No contact was returned");
      toast.success(`${fullName(e)} converted to a contact`);
      router.push(`/crm/${contactId}`);
    } catch (err) {
      toast.error(errMsg(err, "Could not convert this enquiry"));
      setConverting(null);
    }
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    setArchiveBusy(true);
    try {
      await api.crm.updateEnquiry(archiving.id, { status: "ARCHIVED" });
      toast.success("Enquiry archived");
      setArchiving(null);
      load();
      loadNewCount();
    } catch (err) {
      toast.error(errMsg(err, "Could not archive this enquiry"));
    } finally {
      setArchiveBusy(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <PermissionGate
      permission="crm:view"
      fallback={
        <EmptyState
          icon={<ClipboardCheck className="h-6 w-6 text-muted-foreground" />}
          title="No access to enquiries"
          description="You don't have permission to view the enquiries inbox."
        />
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Enquiries"
          description="Incoming leads from the website and other channels — convert the good ones into contacts, archive the rest."
        />

        {/* Status tabs */}
        <Tabs value={status} onValueChange={(v) => setStatus(v as EnquiryStatus)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {t.value === "NEW" && newCount !== null && newCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {newCount}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<Warning className="h-6 w-6 text-destructive" />}
            title="Couldn't load enquiries"
            description={error}
            action={{ label: "Retry", onClick: () => load() }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6 text-muted-foreground" />}
            title={EMPTY_TITLE[status]}
            description={EMPTY_DESC[status]}
          />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Interest</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => {
                  const badge = STATUS_BADGE[e.status];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="align-top">
                        <div className="font-medium">{fullName(e)}</div>
                        {e.matchedContact && (
                          <Link
                            href={`/crm/${e.matchedContact.id}`}
                            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            title="This enquiry matches an existing contact"
                          >
                            <ArrowRight className="size-3" />
                            matches: {e.matchedContact.name}
                          </Link>
                        )}
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="flex flex-col gap-0.5 text-xs">
                          {e.email && (
                            <a
                              href={`mailto:${e.email}`}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <Mail className="size-3" />
                              {e.email}
                            </a>
                          )}
                          {e.phone && (
                            <a
                              href={`tel:${e.phone}`}
                              className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
                            >
                              <Phone className="size-3" />
                              {e.phone}
                            </a>
                          )}
                          {!e.email && !e.phone && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>

                      <TableCell className="align-top">
                        {e.interest ? (
                          <Badge variant="outline" className="capitalize">
                            {e.interest}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top text-sm text-muted-foreground capitalize">
                        {e.source || "—"}
                      </TableCell>

                      <TableCell className="max-w-[18rem] align-top whitespace-normal text-sm text-muted-foreground">
                        {e.message ? (
                          <span title={e.message}>{truncate(e.message)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top text-sm text-muted-foreground">
                        {formatDate(e.createdAt)}
                      </TableCell>

                      <TableCell className="align-top">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>

                      <TableCell className="align-top text-right">
                        {e.status === "NEW" ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              onClick={() => convert(e)}
                              disabled={converting === e.id}
                            >
                              <UserAdd />
                              {converting === e.id ? "Converting…" : "Convert to contact"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setArchiving(e)}
                              disabled={converting === e.id}
                              title="Archive"
                            >
                              <Archive />
                              Archive
                            </Button>
                          </div>
                        ) : e.status === "CONVERTED" && e.contactId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            render={<Link href={`/crm/${e.contactId}`} />}
                          >
                            Open contact
                            <ArrowRight />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Archive confirm */}
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title="Archive enquiry?"
        description={
          archiving
            ? `"${fullName(archiving)}" will be moved to the Archived tab. You can still view it there.`
            : ""
        }
        confirmLabel="Archive"
        loading={archiveBusy}
        onConfirm={confirmArchive}
      />
    </PermissionGate>
  );
}
