import { PageHeader } from "@/components/shared/page-header";

interface ComingSoonProps {
  title: string;
  description?: string;
}

/** Phase-1 placeholder. Real content ships in Phase 2+. */
export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground font-semibold">
          V7
        </div>
        <p className="text-base font-medium">Coming soon</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          This surface is part of the Phase 2+ feature port. The navigation, auth, and shell are in
          place — content lands next.
        </p>
      </div>
    </div>
  );
}
