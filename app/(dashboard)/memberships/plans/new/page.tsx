"use client";

import { PermissionGate } from "@/components/shared/permission-gate";
import { PlanForm } from "../plan-form";

export default function NewPlanPage() {
  return (
    <PermissionGate
      permission="plans:edit"
      fallback={
        <p className="rounded-lg border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          You don&apos;t have permission to create plans.
        </p>
      }
    >
      <PlanForm />
    </PermissionGate>
  );
}
