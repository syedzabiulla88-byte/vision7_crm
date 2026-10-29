"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api, type BlogRow, type BlogStatus, type BlogList } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Pagination } from "@/components/shared/pagination";
import { PermissionGate } from "@/components/shared/permission-gate";
import { usePermissions } from "@/components/hooks/use-permissions";
import { useAuth } from "@/components/providers/auth-provider";
import { BlogStatusBadge, STATUS_LABEL } from "@/components/blog/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, FileText, Trash } from "@/lib/icons";

const PAGE_SIZE = 20;
const STATUSES: BlogStatus[] = ["DRAFT", "IN_REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"];

const LANGUAGE_FILTER = [
  { value: "ALL", label: "All languages" },
  { value: "en", label: "English" },
  { value: "ar", label: "العربية (Arabic)" },
];
const ASSIGNED_FILTER = [
  { value: "ALL", label: "Anyone" },
  { value: "me", label: "Me" },
  { value: "unassigned", label: "Unassigned" },
];

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

export default function BlogListPage() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const canCreate = can("blogs:create");
  const canDelete = can("blogs:delete");
  const canPublish = can("blogs:publish");

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<BlogList | null>(null);
  const [status, setStatus] = useState<"ALL" | BlogStatus>("ALL");
  const [language, setLanguage] = useState("ALL");
  const [assigned, setAssigned] = useState("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<BlogRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: PAGE_SIZE };
      if (status !== "ALL") params.status = status;
      if (language !== "ALL") params.language = language;
      if (assigned !== "ALL") params.assigned = assigned;
      if (search) params.q = search;
      setResult(await api.blog.list(params));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load blog posts");
    } finally {
      setLoading(false);
    }
  }, [page, status, language, assigned, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch((prev) => {
        if (prev === searchInput.trim()) return prev;
        setPage(1);
        return searchInput.trim();
      });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const rows = result?.data ?? [];
  const meta = result?.meta;
  const counts = meta?.counts;
  const totalAll = counts ? STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0) : 0;
  const hasFilters = status !== "ALL" || language !== "ALL" || assigned !== "ALL" || !!search;

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.blog.remove(toDelete.id);
      toast.success("Post deleted");
      setToDelete(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the post");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog & SEO"
        description="Write, review and publish articles to vision7.sa."
        onRefresh={load}
        actions={
          <PermissionGate permission="blogs:create">
            <Button render={<Link href="/blog/new" />}>
              <Plus className="h-4 w-4" /> New post
            </Button>
          </PermissionGate>
        }
      />

      {/* Status tabs with counts */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {(["ALL", ...STATUSES] as const).map((s) => {
          const n = s === "ALL" ? totalAll : (counts?.[s] ?? 0);
          const active = status === s;
          return (
            <Button
              key={s}
              role="tab"
              aria-selected={active}
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {s === "ALL" ? "All" : STATUS_LABEL[s]}
              <span className="ml-1.5 tabular-nums opacity-70">{n}</span>
            </Button>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="blog-search" className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="blog-search"
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Title or URL…"
                  className="w-full pl-8 md:w-64"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Language</Label>
              <Select
                items={LANGUAGE_FILTER}
                value={language}
                onValueChange={(v) => {
                  setLanguage((v as string) ?? "ALL");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All languages</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية (Arabic)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Assigned to</Label>
              <Select
                items={ASSIGNED_FILTER}
                value={assigned}
                onValueChange={(v) => {
                  setAssigned((v as string) ?? "ALL");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Anyone</SelectItem>
                  <SelectItem value="me">Me</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStatus("ALL");
                  setLanguage("ALL");
                  setAssigned("ALL");
                  setSearchInput("");
                  setSearch("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Words</TableHead>
                  <TableHead>Updated</TableHead>
                  {canDelete && <TableHead className="w-px text-right"><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: canDelete ? 8 : 7 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canDelete ? 8 : 7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-6 w-6" />
                        <p>
                          {hasFilters
                            ? "No posts match your filters."
                            : canCreate
                              ? "No posts yet. Write the first one."
                              : "No posts yet."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((p) => {
                    const mine = p.assignedToId === user?.id;
                    const deletable = canDelete && (canPublish || (p.status !== "PUBLISHED" && p.status !== "SCHEDULED"));
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="max-w-[24rem]">
                          <Link href={`/blog/${p.id}`} className="font-medium hover:text-primary">
                            <span className="line-clamp-2" dir="auto">{p.title}</span>
                          </Link>
                          <span className="block truncate font-mono text-xs text-muted-foreground" dir="ltr">/blog/{p.slug}</span>
                          {p.status === "DRAFT" && p.reviewNote && (
                            <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">Changes requested: {p.reviewNote}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <BlogStatusBadge status={p.status} />
                          {p.status === "SCHEDULED" && (
                            <span className="mt-1 block text-xs text-muted-foreground">{fmt(p.scheduledAt)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {p.assignedTo ? (
                            <span className="inline-flex items-center gap-1.5">
                              {p.assignedTo.name || "—"}
                              {mine && <Badge variant="secondary">You</Badge>}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>{p.language === "ar" ? "العربية" : "English"}</TableCell>
                        <TableCell>{p.category || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.wordCount}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmt(p.updatedAt)}</TableCell>
                        {canDelete && (
                          <TableCell className="text-right">
                            {deletable && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Delete ${p.title}`}
                                title="Delete"
                                onClick={() => setToDelete(p)}
                              >
                                <Trash className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {meta && (
            <Pagination
              page={meta.page}
              pageSize={meta.limit}
              total={meta.total}
              totalPages={meta.totalPages}
              onPageChange={setPage}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this post?"
        description={`“${toDelete?.title ?? ""}” will be removed permanently${toDelete?.status === "PUBLISHED" ? " and taken off the website" : ""}. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  );
}
