"use client";

import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "@/lib/icons";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned actions (buttons, etc.). */
  actions?: ReactNode;
  /**
   * When provided, shows a Refresh button that re-runs this callback (typically
   * the page's data-load function) and spins while it's in flight — so users can
   * pull fresh data without a full browser reload.
   */
  onRefresh?: () => void | Promise<void>;
  className?: string;
}

export function PageHeader({ title, description, actions, onRefresh, className }: PageHeaderProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {(onRefresh || actions) && (
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh"
              aria-label="Refresh"
            >
              <RotateCcw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
