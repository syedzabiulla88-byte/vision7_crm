"use client";

import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { PermissionGate } from "@/components/shared/permission-gate";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  TrendUp,
  Users as UsersIcon,
  Calendar,
  LayoutGrid,
  Bell,
  ArrowRight,
  Chart,
} from "@/lib/icons";

const REPORTS = [
  {
    href: "/reports/billing",
    title: "Billing",
    body: "Invoiced totals, paid vs outstanding, monthly revenue trend, top paying customers.",
    icon: TrendUp,
  },
  {
    href: "/reports/customers",
    title: "Customers",
    body: "Pipeline stage breakdown, lead sources, gender split, tag frequency, conversion.",
    icon: UsersIcon,
  },
  {
    href: "/reports/bookings",
    title: "Bookings",
    body: "Volume by facility, status, gender, time-of-day and day-of-week.",
    icon: Calendar,
  },
  {
    href: "/reports/facilities",
    title: "Facilities",
    body: "Per-facility utilisation, revenue and bookings vs available slots.",
    icon: LayoutGrid,
  },
  {
    href: "/reports/followups",
    title: "Sales Follow-ups",
    body: "Per-rep follow-up load — assigned, completed, overdue, completion rate; run reminder digest.",
    icon: Bell,
  },
];

export default function ReportsHubPage() {
  return (
    <PermissionGate
      permission="reports:view"
      fallback={
        <EmptyState
          icon={<Chart className="h-6 w-6 text-muted-foreground" />}
          title="No access"
          description="You don't have permission to view reports."
        />
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Reports"
          description="Cross-cuts of every operational stream — billing, customers, bookings, facilities. Each report is exportable as CSV."
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <Link key={r.href} href={r.href} className="group">
                <Card className="h-full transition-colors hover:ring-[#FFCF01]/60">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md border border-[#FFCF01]/30 bg-[#FFCF01]/5 text-[#FFCF01]">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h3 className="text-base font-semibold transition-colors group-hover:text-[#FFCF01]">
                            {r.title}
                          </h3>
                          <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-[#FFCF01]" />
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">{r.body}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </PermissionGate>
  );
}
