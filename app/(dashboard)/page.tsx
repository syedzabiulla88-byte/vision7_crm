"use client";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { useAuth } from "@/components/providers/auth-provider";
import {
  Users as UsersIcon,
  UsersMultiple,
  Calendar,
  FileText,
} from "@/lib/icons";

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] || "there";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Cross-app overview of the Vision7 business. Live KPIs land in Phase 2."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active members" value="—" hint="Coming soon" hue="emerald" icon={<UsersMultiple className="h-6 w-6" />} />
        <StatCard label="Open leads" value="—" hint="Coming soon" hue="yellow" icon={<UsersIcon className="h-6 w-6" />} />
        <StatCard label="Bookings (7d)" value="—" hint="Coming soon" hue="navy" icon={<Calendar className="h-6 w-6" />} />
        <StatCard label="Outstanding invoices" value="—" hint="Coming soon" hue="amber" icon={<FileText className="h-6 w-6" />} />
      </div>

      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">Single pane of glass</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Revenue charts, membership expirations, CRM pipeline, booking volume, and deep-links into
          the platform club-management app are part of the Phase 2+ build.
        </p>
      </div>
    </div>
  );
}
