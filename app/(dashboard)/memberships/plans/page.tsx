"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PermissionGate } from "@/components/shared/permission-gate";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Pencil,
  Trash,
  Tag,
  Check,
  Close as XIcon,
} from "@/lib/icons";
import {
  TYPE_LABELS,
  TYPE_ORDER,
  CATEGORY_LABELS,
  BILLING_LABELS,
  formatSAR,
  type Plan,
  type PlanType,
} from "./plan-constants";

type FilterValue = "ALL" | PlanType;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "ALL", label: "All Types" },
  ...TYPE_ORDER.map((t) => ({ value: t, label: TYPE_LABELS[t] })),
];

export default function PlansPage() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [typeFilter, setTypeFilter] = useState<FilterValue>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.plans.list({ limit: 1000 });
      const rows: Plan[] = Array.isArray(result) ? result : result?.data || [];
      setPlans(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.plans.delete(deleteTarget.id);
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete plan");
    } finally {
      setDeleting(false);
    }
  };

  const newPlanAction = (
    <PermissionGate permission="memberships:create">
      <Button render={<Link href="/memberships/plans/new" />}>
        <Plus className="h-4 w-4" />
        New Plan
      </Button>
    </PermissionGate>
  );

  // Collapse every plan into one of the two offered buckets. Academy stays
  // Academy; everything else (Leisure, legacy Personal Training, untyped)
  // falls under Leisure so no plan disappears.
  const bucketOf = (p: Plan): PlanType =>
    (p.type as PlanType) === "ACADEMY" ? "ACADEMY" : "LEISURE";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Membership Plans"
        description="Define pricing, billing cycles and features for each Academy and Leisure offering."
        onRefresh={load}
        actions={newPlanAction}
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border">
          <EmptyState
            icon={<Tag className="h-6 w-6 text-muted-foreground" />}
            title="No plans yet"
            description="Create your first membership plan to start assigning memberships and feeding the public pricing pages."
          />
          <PermissionGate permission="memberships:create">
            <div className="flex justify-center pb-16">
              <Button render={<Link href="/memberships/plans/new" />}>
                <Plus className="h-4 w-4" />
                Create first plan
              </Button>
            </div>
          </PermissionGate>
        </div>
      ) : (
        <>
          {/* Plan type filter */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={typeFilter === opt.value ? "default" : "outline"}
                onClick={() => setTypeFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {/* Grouped by category sections (Academy / Leisure) */}
          {TYPE_ORDER.filter((t) => typeFilter === "ALL" || typeFilter === t).map(
            (type) => {
              const group = plans.filter((p) => bucketOf(p) === type);
              if (group.length === 0) return null;
              return (
                <PlanSection
                  key={type}
                  title={TYPE_LABELS[type]}
                  count={group.length}
                >
                  {group.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      onDelete={() => setDeleteTarget(plan)}
                    />
                  ))}
                </PlanSection>
              );
            },
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete plan"
        description={
          deleteTarget
            ? `Delete plan "${deleteTarget.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function PlanSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <Badge variant="secondary">{count}</Badge>
        <Separator className="flex-1" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function PlanCard({ plan, onDelete }: { plan: Plan; onDelete: () => void }) {
  const features = Array.isArray(plan.features) ? plan.features : [];
  return (
    <Card
      className="flex flex-col"
      style={
        plan.color
          ? { borderTop: `3px solid ${plan.color}` }
          : undefined
      }
    >
      <CardContent className="flex flex-1 flex-col gap-3 px-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABELS[plan.category || ""] || plan.category || "—"}
          </p>
          {plan.isActive ? (
            <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <XIcon className="h-3 w-3" />
              Inactive
            </Badge>
          )}
          {plan.isFamilyPlan && (
            <Badge
              variant="outline"
              className="text-sky-600 dark:text-sky-400"
              title="Family package: holders can link covered members, who are invoiced at zero."
            >
              Family
            </Badge>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
          {plan.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {plan.description}
            </p>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {formatSAR(plan.price)}
          </span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            / {BILLING_LABELS[plan.billingCycle || ""] || plan.billingCycle || "—"}
          </span>
        </div>

        {features.length > 0 && (
          <ul className="space-y-1.5">
            {features.slice(0, 3).map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FFCF01]" />
                <span className="line-clamp-1">{f}</span>
              </li>
            ))}
            {features.length > 3 && (
              <li className="pl-5 text-xs uppercase tracking-wide text-muted-foreground">
                +{features.length - 3} more
              </li>
            )}
          </ul>
        )}

        <div className="flex-1" />

        <div className="flex gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            render={<Link href={`/memberships/plans/${plan.id}`} />}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <PermissionGate permission="memberships:edit">
            <Button
              variant="destructive"
              size="icon-sm"
              onClick={onDelete}
              aria-label={`Delete ${plan.name}`}
            >
              <Trash className="h-3.5 w-3.5" />
            </Button>
          </PermissionGate>
        </div>
      </CardContent>
    </Card>
  );
}
