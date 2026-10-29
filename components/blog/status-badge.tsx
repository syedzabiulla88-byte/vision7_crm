import { Badge } from "@/components/ui/badge";
import type { BlogStatus } from "@/lib/api";

export const STATUS_LABEL: Record<BlogStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const TONE: Record<BlogStatus, string> = {
  DRAFT: "bg-muted/50 text-foreground border-border",
  IN_REVIEW: "bg-[#FFCF01]/15 text-amber-700 border-[#FFCF01]/40 dark:text-[#FFCF01]",
  SCHEDULED: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400",
  PUBLISHED: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  ARCHIVED: "bg-muted/30 text-muted-foreground border-border",
};

export function BlogStatusBadge({ status }: { status: BlogStatus }) {
  return (
    <Badge variant="outline" className={TONE[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
