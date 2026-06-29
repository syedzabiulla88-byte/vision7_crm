"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { navForPermissions } from "@/lib/nav";
import {
  LayoutGrid,
  Users,
  UsersMultiple,
  Layers,
  ClipboardCheck,
  Award,
  Calendar,
  MapPin,
  FileText,
  Chart,
  TrendUp,
  ShieldUser,
  Shield,
  Settings,
  DoorOpen,
} from "@/lib/icons";

type IconProps = { className?: string };
const ICONS: Record<string, ComponentType<IconProps>> = {
  LayoutGrid,
  Users,
  UsersMultiple,
  Layers,
  ClipboardCheck,
  Award,
  Calendar,
  MapPin,
  FileText,
  Chart,
  TrendUp,
  ShieldUser,
  Shield,
  Settings,
  DoorOpen,
};

/** True when pathname equals href or is nested under it (for non-root hrefs). */
function matchesHref(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * The single active href for a pathname: the LONGEST nav href that matches.
 * So /crm/board activates "Pipeline" (not also "Contacts"), while /crm/[id]
 * activates "Contacts" (no more-specific nav item exists for it).
 */
function activeHrefFor(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (matchesHref(pathname, href) && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const groups = navForPermissions(user?.permissions);
  const activeHref = activeHrefFor(
    pathname,
    groups.flatMap((g) => g.items.map((i) => i.href)),
  );

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-[#FFCF01]/15 bg-[#011b2b] text-white md:flex">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 border-b border-[#FFCF01]/15 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vision-logo.svg" alt="Vision7" className="h-9 w-auto" />
        <span className="text-[10px] uppercase leading-tight tracking-wider text-[#FFCF01]">
          Control
          <br />
          Plane
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                        active
                          ? "bg-[#FFCF01] font-medium text-[#011b2b]"
                          : "text-white/80 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      {Icon && <Icon className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
