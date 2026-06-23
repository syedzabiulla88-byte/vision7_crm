"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  /** Page size (rows per page). */
  pageSize: number;
  /** Total matching rows across all pages. */
  total: number;
  /** Total page count. */
  totalPages: number;
  /** Called with the next 1-based page. */
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Server-side pagination control. Renders nothing when there's a single page
 * (or none). Shows "X–Y of N" plus Prev/Next, with the buttons disabled at the
 * bounds. Pair with a list page that passes { page, limit } to the API and
 * feeds back `meta` ({ total, page, limit, totalPages }).
 */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  if (!total || totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={cn("flex items-center justify-between gap-4 py-3", className)}>
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from.toLocaleString()}</span>–
        <span className="font-medium text-foreground">{to.toLocaleString()}</span> of{" "}
        <span className="font-medium text-foreground">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Prev</span>
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
