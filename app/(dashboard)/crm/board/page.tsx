"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGate } from "@/components/shared/permission-gate";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Plus,
  Mail,
  Phone,
  ArrowRight,
  Bell,
  Move,
  Layers,
} from "@/lib/icons";

// ─── Stage model ─────────────────────────────────────────────────────────────

type StageKey = "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "WON" | "LOST";

interface StageDef {
  key: StageKey;
  label: string;
  /** Header text + border accent. */
  accent: string;
  /** Subtle column-header background tint. */
  tint: string;
}

const STAGES: StageDef[] = [
  { key: "NEW", label: "New", accent: "border-amber-500/40 text-amber-600 dark:text-amber-300", tint: "bg-amber-500/5" },
  { key: "CONTACTED", label: "Contacted", accent: "border-sky-500/40 text-sky-600 dark:text-sky-300", tint: "bg-sky-500/5" },
  { key: "QUALIFIED", label: "Qualified", accent: "border-violet-500/40 text-violet-600 dark:text-violet-300", tint: "bg-violet-500/5" },
  { key: "PROPOSAL", label: "Proposal", accent: "border-orange-500/40 text-orange-600 dark:text-orange-300", tint: "bg-orange-500/5" },
  { key: "WON", label: "Won", accent: "border-emerald-500/40 text-emerald-600 dark:text-emerald-300", tint: "bg-emerald-500/5" },
  { key: "LOST", label: "Lost", accent: "border-rose-500/40 text-rose-600 dark:text-rose-300", tint: "bg-rose-500/5" },
];

// ─── Data shapes (API payloads are loosely typed) ──────────────────────────────

interface BoardContact {
  id: string;
  firstName?: string;
  lastName?: string | null;
  email?: string;
  phone?: string | null;
  stage?: StageKey;
  tags?: string[];
  _count?: {
    followUps?: number;
    bookings?: number;
    invoices?: number;
  };
  [k: string]: unknown;
}

interface BoardColumn {
  stage: StageKey;
  contacts: BoardContact[];
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function CrmBoardPage() {
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drag state (native HTML5 DnD — no extra library installed).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragFromStage, setDragFromStage] = useState<StageKey | null>(null);
  const [hoverStage, setHoverStage] = useState<StageKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.crm.board();
      setColumns((res?.stages || []) as BoardColumn[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load board";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Move a contact between stages with an optimistic update + revert on failure. */
  const moveContact = useCallback(
    async (id: string, fromStage: StageKey, toStage: StageKey) => {
      if (fromStage === toStage) return;

      let movedName = "Contact";

      // Optimistic update.
      setColumns((prev) => {
        const next = prev.map((col) => ({ ...col, contacts: col.contacts.slice() }));
        const fromCol = next.find((c) => c.stage === fromStage);
        const toCol = next.find((c) => c.stage === toStage);
        if (!fromCol || !toCol) return prev;
        const idx = fromCol.contacts.findIndex((c) => c.id === id);
        if (idx < 0) return prev;
        const [moved] = fromCol.contacts.splice(idx, 1);
        moved.stage = toStage;
        movedName = [moved.firstName, moved.lastName].filter(Boolean).join(" ") || "Contact";
        toCol.contacts.unshift(moved);
        return next;
      });

      try {
        await api.crm.setStage(id, toStage);
        const label = STAGES.find((s) => s.key === toStage)?.label ?? toStage;
        toast.success(`${movedName} moved to ${label}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update stage";
        toast.error(message);
        load(); // revert by reloading the authoritative board
      }
    },
    [load],
  );

  // Drag handlers.
  const onDragStart = (id: string, fromStage: StageKey) => {
    setDragId(id);
    setDragFromStage(fromStage);
  };
  const clearDrag = () => {
    setDragId(null);
    setDragFromStage(null);
    setHoverStage(null);
  };
  const onDragOver = (e: React.DragEvent, stage: StageKey) => {
    e.preventDefault();
    if (hoverStage !== stage) setHoverStage(stage);
  };
  const onDrop = (e: React.DragEvent, toStage: StageKey) => {
    e.preventDefault();
    const id = dragId;
    const from = dragFromStage;
    clearDrag();
    if (id && from) moveContact(id, from, toStage);
  };

  const totalContacts = columns.reduce((sum, c) => sum + (c.contacts?.length || 0), 0);

  return (
    <PermissionGate
      permission="crm:view"
      fallback={
        <EmptyState
          icon={<Layers className="h-6 w-6 text-muted-foreground" />}
          title="No access"
          description="You don't have permission to view the sales pipeline."
        />
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Pipeline"
          description="Drag contacts across stages as they move through the funnel. Won contacts auto-convert to customers; lost ones are archived."
          onRefresh={load}
          actions={
            <Button size="sm" render={<Link href="/crm/new" />}>
              <Plus className="h-4 w-4" />
              New Contact
            </Button>
          }
        />

        {loading ? (
          <BoardSkeleton />
        ) : error ? (
          <EmptyState
            icon={<Layers className="h-6 w-6 text-muted-foreground" />}
            title="Couldn't load the pipeline"
            description={error}
            action={{ label: "Try again", onClick: load }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {STAGES.map((stage) => {
              const col = columns.find((c) => c.stage === stage.key) || {
                stage: stage.key,
                contacts: [],
              };
              const isHover = hoverStage === stage.key;
              return (
                <div
                  key={stage.key}
                  onDragOver={(e) => onDragOver(e, stage.key)}
                  onDragLeave={() => setHoverStage((h) => (h === stage.key ? null : h))}
                  onDrop={(e) => onDrop(e, stage.key)}
                  className={cn(
                    "flex min-h-[220px] flex-col rounded-lg border transition-colors",
                    isHover ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-between rounded-t-lg border-b px-3 py-2",
                      stage.accent,
                      stage.tint,
                    )}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider">{stage.label}</p>
                    <Badge variant="secondary" className="tabular-nums">
                      {col.contacts.length}
                    </Badge>
                  </div>

                  <div className="flex-1 space-y-2 p-2">
                    {col.contacts.length === 0 ? (
                      <p className="py-8 text-center text-xs italic text-muted-foreground/70">
                        Drop contacts here
                      </p>
                    ) : (
                      col.contacts.map((contact) => (
                        <ContactCard
                          key={contact.id}
                          contact={contact}
                          stage={stage.key}
                          isDragging={dragId === contact.id}
                          onDragStart={onDragStart}
                          onDragEnd={clearDrag}
                          onMove={moveContact}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && (
          <p className="text-xs text-muted-foreground">
            {totalContacts} contact{totalContacts === 1 ? "" : "s"} in pipeline. Tip: drag a card, or
            use the move menu on touch devices.
          </p>
        )}
      </div>
    </PermissionGate>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────────

interface ContactCardProps {
  contact: BoardContact;
  stage: StageKey;
  isDragging: boolean;
  onDragStart: (id: string, fromStage: StageKey) => void;
  onDragEnd: () => void;
  onMove: (id: string, fromStage: StageKey, toStage: StageKey) => void;
}

function ContactCard({
  contact,
  stage,
  isDragging,
  onDragStart,
  onDragEnd,
  onMove,
}: ContactCardProps) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed";
  const tags = contact.tags || [];
  const counts = contact._count || {};

  return (
    <div
      draggable
      onDragStart={() => onDragStart(contact.id, stage)}
      onDragEnd={onDragEnd}
      className={cn(
        "group cursor-move rounded-md border bg-card p-3 shadow-xs transition-all hover:border-primary/50",
        isDragging ? "border-primary opacity-40" : "border-border",
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="flex-1 truncate text-sm font-semibold">{name}</p>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Move-via-menu fallback for touch / keyboard users. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move to stage"
                  title="Move to stage"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Move className="h-4 w-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STAGES.map((s) => (
                <DropdownMenuItem
                  key={s.key}
                  disabled={s.key === stage}
                  onClick={() => onMove(contact.id, stage, s.key)}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Open ${name}`}
            title="Open in CRM"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            render={<Link href={`/crm/${contact.id}`} onClick={(e) => e.stopPropagation()} />}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {contact.email && (
        <p className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground">
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate">{contact.email}</span>
        </p>
      )}
      {contact.phone && (
        <p className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground">
          <Phone className="h-3 w-3 shrink-0" />
          <span className="truncate">{contact.phone}</span>
        </p>
      )}

      {(tags.length > 0 ||
        (counts.followUps ?? 0) > 0 ||
        (counts.bookings ?? 0) > 0 ||
        (counts.invoices ?? 0) > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="outline" className="font-normal">
              {tag}
            </Badge>
          ))}
          {(counts.followUps ?? 0) > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-600 dark:text-amber-300"
            >
              <Bell className="h-3 w-3" />
              {counts.followUps}
            </Badge>
          )}
          {(counts.bookings ?? 0) > 0 && (
            <Badge
              variant="outline"
              className="border-sky-500/40 text-sky-600 dark:text-sky-300"
            >
              {counts.bookings} bk
            </Badge>
          )}
          {(counts.invoices ?? 0) > 0 && (
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-600 dark:text-emerald-300"
            >
              {counts.invoices} inv
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────────

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {STAGES.map((stage) => (
        <div key={stage.key} className="flex min-h-[220px] flex-col rounded-lg border border-border">
          <div className="flex items-center justify-between rounded-t-lg border-b border-border px-3 py-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          <div className="flex-1 space-y-2 p-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-md border border-border p-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
