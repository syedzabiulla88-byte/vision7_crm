"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  Trophy,
  Soccer,
  Share2,
  Check,
  Warning,
  InfoCircle,
} from "@/lib/icons";

// Deep-link targets. Env first (set in .env.local), then the production https URLs.
const PLATFORM_URL = process.env.NEXT_PUBLIC_PLATFORM_URL || "https://platform.vision7.sa";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://vision7.sa";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.vision7.sa/api";

// The shared backend health probe target (Swagger always answers on /docs).
const API_DOCS = API_URL.replace(/\/+$/, "").replace(/\/api$/, "") + "/api/docs";

type Health = "checking" | "online" | "offline" | "unknown";

interface AppEntry {
  key: string;
  name: string;
  role: string;
  description: string;
  domain: string;
  href: string | null;
  /** External apps open in a new tab; this CRM is "current". */
  external: boolean;
  current?: boolean;
  icon: typeof LayoutGrid;
}

const APPS: AppEntry[] = [
  {
    key: "crm",
    name: "CRM Control Plane",
    role: "Cross-app command centre — KPIs, members, billing, roles, settings",
    description:
      "You are here. The single pane of glass over the whole Vision7 business, talking to the shared NestJS backend.",
    domain: "crm.vision7.sa",
    href: null,
    external: false,
    current: true,
    icon: LayoutGrid,
  },
  {
    key: "platform",
    name: "Platform — Club Management",
    role: "Coaching dashboard — teams, athletes, training, events",
    description:
      "The active club-management surface for coaches and academy staff. Manages rosters, sessions, attendance and performance.",
    domain: "platform.vision7.sa",
    href: PLATFORM_URL,
    external: true,
    icon: Trophy,
  },
  {
    key: "site",
    name: "Public Site",
    role: "Public academy + leisure site, bookings, member area, business admin",
    description:
      "The customer-facing vision7.sa — academy and wellness bookings, membership sign-up, and the business admin pages.",
    domain: "vision7.sa",
    href: SITE_URL,
    external: true,
    icon: Soccer,
  },
];

function HealthBadge({ status }: { status: Health }) {
  if (status === "checking") {
    return (
      <Badge variant="outline" className="gap-1.5 text-muted-foreground">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
        Checking…
      </Badge>
    );
  }
  if (status === "online") {
    return (
      <Badge variant="outline" className="gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" />
        Online
      </Badge>
    );
  }
  if (status === "offline") {
    return (
      <Badge variant="outline" className="gap-1.5 border-rose-500/30 text-rose-600 dark:text-rose-400">
        <Warning className="h-3 w-3" />
        Unreachable
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 text-muted-foreground">
      <InfoCircle className="h-3 w-3" />
      Live
    </Badge>
  );
}

export default function ConnectedAppsPage() {
  // We can only directly probe the shared backend (CORS-friendly). Frontends are
  // deep-link-only — embedding is out of scope — so they show as "Live".
  const [apiHealth, setApiHealth] = useState<Health>("checking");

  useEffect(() => {
    let cancelled = false;
    fetch(API_DOCS, { method: "GET", mode: "no-cors" })
      .then(() => {
        if (!cancelled) setApiHealth("online");
      })
      .catch(() => {
        if (!cancelled) setApiHealth("offline");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connected Apps"
        description="The Vision7 ecosystem at a glance. Every app talks to the shared backend — deep-link out to manage each surface in its own tab."
      />

      {/* Ecosystem summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Apps in ecosystem"
          value={APPS.length}
          hint="CRM, Platform, Site"
          hue="navy"
          icon={<LayoutGrid className="h-6 w-6" />}
        />
        <StatCard
          label="Shared backend"
          value={apiHealth === "online" ? "Online" : apiHealth === "offline" ? "Unreachable" : "Checking…"}
          hint={API_DOCS.replace(/^https?:\/\//, "")}
          hue={apiHealth === "offline" ? "rose" : "emerald"}
          icon={<Share2 className="h-6 w-6" />}
        />
        <StatCard
          label="Integration"
          value="JWT Bearer"
          hint="One auth across all clients"
          hue="yellow"
          icon={<Check className="h-6 w-6" />}
        />
      </div>

      {/* App cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {APPS.map((app) => {
          const Icon = app.icon;
          return (
            <Card key={app.key} className="h-full">
              <CardContent className="flex h-full flex-col gap-4 py-2">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[#FFCF01]/30 bg-[#FFCF01]/5 text-[#FFCF01]">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{app.name}</h3>
                      {app.current ? (
                        <Badge variant="outline" className="border-[#FFCF01]/40 text-[#FFCF01]">
                          Current
                        </Badge>
                      ) : (
                        <HealthBadge status={apiHealth === "online" ? "unknown" : apiHealth} />
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{app.role}</p>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">{app.description}</p>

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
                  <span className="truncate font-mono text-xs text-muted-foreground">{app.domain}</span>
                  {app.external && app.href ? (
                    <Button
                      variant="outline"
                      size="sm"
                      render={
                        <a href={app.href} target="_blank" rel="noopener noreferrer" />
                      }
                    >
                      Open app
                      <Share2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Badge variant="secondary">This app</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Note: connected apps open in a new tab (deep-links only) — embedding is out of scope. Health
        reflects the shared backend; per-frontend status is informational.
      </p>
    </div>
  );
}
