"use client";

import { clip, scoreTone, type SeoReport, type CheckState } from "@/lib/blog-seo";
import { cn } from "@/lib/utils";
import { CheckCircle, Warning, CloseCircle } from "@/lib/icons";

const SITE = "https://www.vision7.sa";

const TONE_CLASS = {
  good: "text-emerald-700 dark:text-emerald-400",
  ok: "text-amber-700 dark:text-amber-400",
  poor: "text-red-700 dark:text-red-400",
} as const;

/** How the post will look in a Google result (approximate — Google decides the final text). */
export function SerpPreview({
  title,
  slug,
  description,
  dir,
}: {
  title: string;
  slug: string;
  description: string;
  dir: "ltr" | "rtl";
}) {
  return (
    <div className="rounded-md border bg-background p-3" aria-label="Search result preview">
      <p className="truncate text-xs text-muted-foreground" dir="ltr">
        {SITE.replace("https://", "")} › blog › {slug || "…"}
      </p>
      <p dir={dir} className="mt-0.5 text-[1.05rem] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
        {clip(title, 60) || "Post title"}
      </p>
      <p dir={dir} className="mt-0.5 text-sm leading-snug text-muted-foreground">
        {clip(description, 160) || "Your meta description appears here."}
      </p>
    </div>
  );
}

const ICON: Record<CheckState, typeof CheckCircle> = { pass: CheckCircle, warn: Warning, fail: CloseCircle };
const ICON_CLASS: Record<CheckState, string> = {
  pass: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-red-600 dark:text-red-400",
};

export function SeoChecklist({ report }: { report: SeoReport }) {
  const tone = scoreTone(report.score);
  // Problems first, so the thing to fix is at the top.
  const order: Record<CheckState, number> = { fail: 0, warn: 1, pass: 2 };
  const sorted = [...report.checks].sort((a, b) => order[a.state] - order[b.state]);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className={cn("text-3xl font-semibold tabular-nums", TONE_CLASS[tone])}>{report.score}</span>
        <span className="text-sm text-muted-foreground">/ 100 SEO score — advice only, it never blocks publishing</span>
      </div>
      <ul className="space-y-2">
        {sorted.map((c) => {
          const Icon = ICON[c.state];
          return (
            <li key={c.id} className="flex gap-2 text-sm">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_CLASS[c.state])} aria-label={c.state === "pass" ? "Good" : c.state === "warn" ? "Improve" : "Missing"} />
              <span>
                <span className="font-medium">{c.label}</span>
                <span className="block text-xs text-muted-foreground">{c.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "62 / 60" counter that turns amber when out of range. */
export function CharCount({ value, min, max }: { value: number; min?: number; max: number }) {
  const bad = value > max || (min !== undefined && value > 0 && value < min);
  return (
    <span className={cn("text-xs tabular-nums", bad ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
      {value} / {max}
    </span>
  );
}
