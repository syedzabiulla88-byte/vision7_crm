"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  UserAdd,
  Mail,
  Phone,
  ArrowRight,
  Chat,
  Users as UsersIcon,
} from "@/lib/icons";

// ─── Static option lists (ported from site/src/app/admin/crm/page.js) ───────────

const TYPE_FILTERS = [
  { value: "ALL", label: "All contacts" },
  { value: "LEAD", label: "Leads" },
  { value: "CUSTOMER", label: "Customers" },
  { value: "MEMBER", label: "Members" },
  { value: "FORMER", label: "Former" },
];

const STAGE_FILTERS = [
  { value: "ALL", label: "All stages" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

const SOURCE_FILTERS = [
  { value: "ALL", label: "All sources" },
  { value: "walkin", label: "Walk-in" },
  { value: "website", label: "Website enquiry" },
  { value: "referral", label: "Referral" },
  { value: "social", label: "Social media" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
];

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

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function initials(first?: string, last?: string): string {
  return `${(first?.[0] || "?")}${last?.[0] || ""}`.toUpperCase();
}

interface CrmContact {
  id: string;
  firstName?: string;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  type?: string;
  stage?: string;
  source?: string | null;
  tags?: string[];
  lastContactAt?: string | null;
  createdAt?: string;
  _count?: { activities?: number; bookings?: number; invoices?: number };
}

interface CrmOverview {
  total?: number;
  leads?: number;
  customers?: number;
  members?: number;
  withBookings?: number;
}

export default function CrmContactsPage() {
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [overview, setOverview] = useState<CrmOverview | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("ALL");
  const [stage, setStage] = useState("ALL");
  const [source, setSource] = useState("ALL");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [list, ov] = await Promise.all([
          api.crm.list({
            q: q || undefined,
            type: type === "ALL" ? undefined : type,
            stage: stage === "ALL" ? undefined : stage,
            source: source === "ALL" ? undefined : source,
            limit: 200,
          }),
          api.crm.overview().catch(() => null),
        ]);
        if (cancelled) return;
        const rows: CrmContact[] = Array.isArray(list) ? list : list?.data || [];
        setContacts(rows);
        setOverview(ov);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load contacts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(run, q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, type, stage, source]);

  const hasFilters = useMemo(
    () => Boolean(q) || type !== "ALL" || stage !== "ALL" || source !== "ALL",
    [q, type, stage, source],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Every person who has interacted with Vision7 — website bookings, walk-ins, invoiced customers, academy families."
        actions={
          <Button render={<Link href="/crm/new" />}>
            <UserAdd className="h-4 w-4" />
            New Contact
          </Button>
        }
      />

      {overview && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard label="Total" value={overview.total ?? "—"} hue="navy" />
          <StatCard label="Leads" value={overview.leads ?? "—"} hue="amber" />
          <StatCard label="Customers" value={overview.customers ?? "—"} hue="emerald" />
          <StatCard label="Members" value={overview.members ?? "—"} hue="yellow" />
          <StatCard label="With bookings" value={overview.withBookings ?? "—"} hue="navy" />
        </div>
      )}

      <Card>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, email, phone, ID number…"
                className="pl-9"
                aria-label="Search contacts"
              />
            </div>
            <Select items={TYPE_FILTERS} value={type} onValueChange={(v) => setType(v ?? "ALL")}>
              <SelectTrigger className="w-full md:w-44" aria-label="Filter by type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select items={STAGE_FILTERS} value={stage} onValueChange={(v) => setStage(v ?? "ALL")}>
              <SelectTrigger className="w-full md:w-40" aria-label="Filter by stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_FILTERS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select items={SOURCE_FILTERS} value={source} onValueChange={(v) => setSource(v ?? "ALL")}>
              <SelectTrigger className="w-full md:w-44" aria-label="Filter by source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_FILTERS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-center">Bookings</TableHead>
                  <TableHead className="text-center">Invoices</TableHead>
                  <TableHead>Last contact</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : contacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <UsersIcon className="h-6 w-6" />
                        <p>
                          {hasFilters
                            ? "No contacts match your filters."
                            : "No contacts yet. They'll appear here once customers start booking or buying."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  contacts.map((c) => {
                    const activities = c._count?.activities ?? 0;
                    const bookings = c._count?.bookings ?? 0;
                    const invoices = c._count?.invoices ?? 0;
                    const tags = c.tags || [];
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link
                            href={`/crm/${c.id}`}
                            className="flex items-center gap-2 hover:text-primary"
                          >
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px] font-semibold">
                                {initials(c.firstName, c.lastName || undefined)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-medium">
                                {c.firstName} {c.lastName || ""}
                              </p>
                              {activities > 0 && (
                                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Chat className="h-3 w-3" />
                                  {activities} activit{activities === 1 ? "y" : "ies"}
                                </p>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={typeBadgeClass(c.type)}>
                            {c.type || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <a
                            href={`mailto:${c.email}`}
                            className="inline-flex items-center gap-1.5 text-sm hover:text-primary"
                          >
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="max-w-[180px] truncate">{c.email}</span>
                          </a>
                        </TableCell>
                        <TableCell>
                          {c.phone ? (
                            <a
                              href={`tel:${c.phone}`}
                              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
                            >
                              <Phone className="h-3.5 w-3.5" />
                              {c.phone}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {tags.slice(0, 3).map((t) => (
                              <Badge key={t} variant="outline" className="text-[10px]">
                                {t}
                              </Badge>
                            ))}
                            {tags.length > 3 && (
                              <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm capitalize text-muted-foreground">
                          {c.source || "—"}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {bookings || "—"}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {invoices || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(c.lastContactAt || c.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            render={<Link href={`/crm/${c.id}`} />}
                            aria-label="Open contact"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
