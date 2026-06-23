import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type Hue = "navy" | "yellow" | "emerald" | "amber" | "rose";

const HUES: Record<Hue, string> = {
  navy: "text-primary",
  yellow: "text-[#FFCF01]",
  emerald: "text-emerald-500",
  amber: "text-amber-500",
  rose: "text-rose-500",
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  hue?: Hue;
  className?: string;
}

export function StatCard({ label, value, hint, icon, hue = "navy", className }: StatCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          {icon && <div className={cn("shrink-0", HUES[hue])}>{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
