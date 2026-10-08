"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGate } from "@/components/shared/permission-gate";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { usePermissions } from "@/components/hooks/use-permissions";
import { useAsync } from "@/components/hooks/use-async";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { OverviewTab } from "./_overview";
import { LeaderboardTab } from "./_leaderboard";
import { PlayersTab } from "./_players";
import { SessionsTab } from "./_sessions";
import { TeamsTab } from "./_teams";
import { ManagerTab } from "./_manager";
import { timeAgo } from "./_shared";

type Status = { enabled: boolean; configured: boolean; readOnly: boolean; signedReads: boolean; sync: any };

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "players", label: "Players" },
  { value: "sessions", label: "Sessions" },
  { value: "teams", label: "Teams" },
  { value: "leaderboard", label: "Leaderboard" },
  { value: "manager", label: "Coaches, machines & wristbands" },
] as const;

export default function EsaHubPage() {
  const { can } = usePermissions();
  const canToggle = can("settings:manage");
  const canSync = can("memberships:allocate");
  const [ver, setVer] = useState(0);
  const { data: status } = useAsync<Status | null>(() => api.esa.hub.status().catch(() => null), `status:${ver}`, { keepPrevious: true });
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("overview");
  const [confirmOff, setConfirmOff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  const sync = status?.sync;
  const running = !!sync?.running;
  const ready = status?.enabled && status?.configured;
  // Child tabs re-fetch whenever a new pull finishes.
  const rev = String(sync?.lastSuccessAt ?? "none");

  // While a pull is running, poll the status so progress and completion show up on their own.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setVer((v) => v + 1), 5000);
    return () => clearInterval(t);
  }, [running]);

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

  const syncNow = async () => {
    setStarting(true);
    try {
      const r = await api.esa.hub.sync();
      if (r.started) toast.success("Pulling the latest data from ESA…");
      else toast.info(r.reason || "Could not start a sync");
      setVer((v) => v + 1);
    } catch (e: any) {
      toast.error(e?.message || "Could not start the sync");
    } finally {
      setStarting(false);
    }
  };

  const cov = sync?.coverage;

  return (
    <PermissionGate permission="reports:view" fallback={<p className="text-sm text-muted-foreground">You don&apos;t have access to this page.</p>}>
      <div className="space-y-6">
        <PageHeader
          title="ESA Performance Hub"
          description="Athlete, team and venue performance pulled from the ESA gateway and stored in the CRM. Nothing here writes to ESA."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              {canSync && ready && (
                <Button variant="outline" onClick={syncNow} disabled={starting || running}>
                  {running ? "Syncing…" : "Sync now"}
                </Button>
              )}
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
            </div>
          }
        />

        {status && !ready && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            The ESA gateway isn&apos;t enabled/configured yet.{" "}
            <Link href="/admin/settings" className="underline">
              Set it up in Settings → Integrations
            </Link>
            . Turn on <strong>Read-only mode</strong> first so the CRM only pulls data and never writes to ESA.
          </p>
        )}

        {ready && sync && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span>
              Last pulled: <strong className="text-foreground">{timeAgo(sync.lastSuccessAt)}</strong>
            </span>
            {running && <Badge variant="secondary">Syncing…</Badge>}
            {sync.lastRun?.status === "failed" && <Badge variant="destructive">Last sync failed</Badge>}
            {sync.lastRun?.status === "partial" && <Badge variant="outline">Last sync partial</Badge>}
            <span>
              {cov?.users ?? 0} players · sessions stored for {cov?.usersWithSessions ?? 0} ({(cov?.sessions ?? 0).toLocaleString()} sessions) · ESA Index for{" "}
              {cov?.usersWithIndex ?? 0} · {cov?.linked ?? 0} linked to members
            </span>
            {!sync.pullEnabled && <span className="text-amber-600">Automatic pull is switched off</span>}
            {sync.lastRun?.error && <span className="text-destructive">{sync.lastRun.error}</span>}
          </div>
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
            {tab === "overview" && <OverviewTab rev={rev} />}
            {tab === "players" && <PlayersTab rev={rev} canLink={canSync} />}
            {tab === "sessions" && <SessionsTab rev={rev} />}
            {tab === "teams" && <TeamsTab rev={rev} />}
            {tab === "leaderboard" && <LeaderboardTab rev={rev} />}
            {tab === "manager" && <ManagerTab rev={rev} />}
          </>
        ) : (
          status && <p className="text-sm text-muted-foreground">Connect the ESA gateway to see performance data here.</p>
        )}

        <ConfirmDialog
          open={confirmOff}
          onOpenChange={setConfirmOff}
          title="Turn read-only mode off?"
          description="The CRM will start writing to ESA: players are created for every active member on an ESA-enabled plan, accounts are deactivated when memberships freeze or end, and wristbands and credits can be changed. ESA already has live players, so only do this once the plan settings and player links have been checked."
          confirmLabel="Turn off read-only"
          variant="destructive"
          loading={saving}
          onConfirm={() => setReadOnly(false)}
        />
      </div>
    </PermissionGate>
  );
}
