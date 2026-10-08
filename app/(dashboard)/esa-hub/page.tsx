"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGate } from "@/components/shared/permission-gate";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { usePermissions } from "@/components/hooks/use-permissions";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAsync } from "@/components/hooks/use-async";

import { OverviewTab } from "./_overview";
import { LeaderboardTab } from "./_leaderboard";
import { PlayersTab } from "./_players";
import { TeamsTab } from "./_teams";
import { ManagerTab } from "./_manager";

type Status = { enabled: boolean; configured: boolean; readOnly: boolean; signedReads: boolean };

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "leaderboard", label: "Leaderboard" },
  { value: "players", label: "Players" },
  { value: "teams", label: "Teams" },
  { value: "manager", label: "Sessions, machines & coaches" },
] as const;

export default function EsaHubPage() {
  const { can } = usePermissions();
  const canToggle = can("settings:manage");
  const [ver, setVer] = useState(0);
  const { data: status } = useAsync<Status | null>(() => api.esa.hub.status().catch(() => null), `status:${ver}`, { keepPrevious: true });
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("overview");
  const [confirmOff, setConfirmOff] = useState(false);
  const [saving, setSaving] = useState(false);

  const setReadOnly = async (value: boolean) => {
    setSaving(true);
    try {
      await api.settings.set("integrations.esa.read_only", value ? "true" : "false");
      toast.success(value ? "Read-only on — ESA will only be read from" : "Read-only off — CRM changes now sync to ESA");
      setConfirmOff(false);
      setVer((v) => v + 1);
    } catch (e: any) {
      toast.error(e?.message || "Could not change read-only mode");
    } finally {
      setSaving(false);
    }
  };

  const ready = status?.enabled && status?.configured;

  return (
    <PermissionGate permission="reports:view" fallback={<p className="text-sm text-muted-foreground">You don&apos;t have access to this page.</p>}>
      <div className="space-y-6">
        <PageHeader
          title="ESA Performance Hub"
          description="Athlete, team and venue performance pulled from the ESA gateway. Everything on this page is read-only."
          actions={
            <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <div className="text-right">
                <p className="text-sm font-medium leading-tight">Read-only mode</p>
                <p className="text-xs text-muted-foreground">
                  {status?.readOnly ? "Pull data only — no writes to ESA" : "Members sync to ESA automatically"}
                </p>
              </div>
              <Switch
                checked={!!status?.readOnly}
                disabled={!status || !ready || !canToggle || saving}
                onCheckedChange={(v) => (v ? setReadOnly(true) : setConfirmOff(true))}
                aria-label="Read-only mode"
              />
            </div>
          }
        />

        {status && !ready && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            The ESA gateway isn&apos;t enabled/configured yet.{" "}
            <Link href="/admin/settings" className="underline">
              Set it up in Settings → Integrations
            </Link>
            . Tip: turn on <strong>Read-only mode</strong> first to pull data without creating any ESA accounts.
          </p>
        )}
        {status && ready && !canToggle && (
          <p className="text-xs text-muted-foreground">Only users with Settings access can change read-only mode.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {status?.readOnly && <Badge variant="secondary">Read-only</Badge>}
        </div>

        {ready ? (
          <>
            {tab === "overview" && <OverviewTab />}
            {tab === "leaderboard" && <LeaderboardTab />}
            {tab === "players" && <PlayersTab />}
            {tab === "teams" && <TeamsTab />}
            {tab === "manager" && <ManagerTab signedReads={!!status?.signedReads} />}
          </>
        ) : (
          status && <p className="text-sm text-muted-foreground">Connect the ESA gateway to see performance data here.</p>
        )}

        <ConfirmDialog
          open={confirmOff}
          onOpenChange={setConfirmOff}
          title="Turn read-only mode off?"
          description="The CRM will start writing to ESA: players are created for every active member on an ESA-enabled plan, accounts are deactivated when memberships freeze or end, and wristbands and credits can be changed. Only do this once you have checked the plan settings."
          confirmLabel="Turn off read-only"
          variant="destructive"
          loading={saving}
          onConfirm={() => setReadOnly(false)}
        />
      </div>
    </PermissionGate>
  );
}
