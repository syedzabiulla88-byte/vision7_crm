"use client";

import { use, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { PlanForm } from "../plan-form";
import { Skeleton } from "@/components/ui/skeleton";
import type { Plan } from "../plan-constants";

export default function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await api.plans.get(id);
        if (!cancelled) setPlan(p);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load plan");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6">
        <p className="text-sm text-destructive">{error || "Plan not found."}</p>
      </div>
    );
  }

  return <PlanForm initial={plan} editingId={id} />;
}
