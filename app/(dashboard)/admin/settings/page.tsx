"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGate } from "@/components/shared/permission-gate";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Save, Eye, Warning, Wifi, WifiOff, DoorOpen, RefreshCw } from "@/lib/icons";
import { usePermissions } from "@/components/hooks/use-permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingType = "string" | "bool" | "number" | "secret" | "json";

interface SettingMeta {
  key: string;
  label: string;
  group: string;
  type: SettingType;
  public: boolean;
  secret: boolean;
}

const MASK = "********";

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Humanise a raw group slug (e.g. "email_smtp" → "Email Smtp") as a fallback. */
function groupTitle(group: string): string {
  if (!group) return "General";
  return group
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalise a stored value to the string the UI should hold for editing. */
function toFieldValue(meta: SettingMeta, raw: unknown): string {
  if (meta.type === "secret") {
    // Backend returns secrets masked. Keep the mask as the displayed value.
    return raw === undefined || raw === null || raw === "" ? "" : String(raw);
  }
  if (raw === undefined || raw === null) return meta.type === "bool" ? "false" : "";
  return String(raw);
}

export default function SystemSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [catalog, setCatalog] = useState<SettingMeta[]>([]);
  // Current edited values keyed by setting key.
  const [values, setValues] = useState<Record<string, string>>({});
  // Pristine values to diff against (so we only persist real changes).
  const [original, setOriginal] = useState<Record<string, string>>({});
  // Secrets the user actually typed into — mask re-saves are a backend no-op,
  // so we only ship a secret when its field has been touched.
  const [touchedSecrets, setTouchedSecrets] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cat, current] = await Promise.all([
        api.settings.catalog(),
        api.settings.list().catch(() => ({} as Record<string, string>)),
      ]);
      const meta = (Array.isArray(cat) ? cat : []) as SettingMeta[];
      const seeded: Record<string, string> = {};
      for (const m of meta) {
        seeded[m.key] = toFieldValue(m, (current as Record<string, unknown>)?.[m.key]);
      }
      setCatalog(meta);
      setValues(seeded);
      setOriginal(seeded);
      setTouchedSecrets({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Group catalog entries by their `group`, preserving first-seen order.
  const groups = useMemo(() => {
    const map = new Map<string, SettingMeta[]>();
    for (const m of catalog) {
      const g = m.group || "general";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(m);
    }
    return Array.from(map.entries());
  }, [catalog]);

  // Which keys differ from their pristine value (and so should be persisted).
  const changedKeys = useMemo(() => {
    return catalog
      .filter((m) => {
        if (m.type === "secret") return Boolean(touchedSecrets[m.key]);
        return (values[m.key] ?? "") !== (original[m.key] ?? "");
      })
      .map((m) => m.key);
  }, [catalog, values, original, touchedSecrets]);

  const dirty = changedKeys.length > 0;

  function setValue(meta: SettingMeta, next: string) {
    setValues((prev) => ({ ...prev, [meta.key]: next }));
    if (meta.type === "secret") {
      setTouchedSecrets((prev) => ({ ...prev, [meta.key]: true }));
    }
  }

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const key of changedKeys) payload[key] = values[key] ?? "";
      await api.settings.bulkSet(payload);
      // Adopt the saved values as the new baseline.
      setOriginal((prev) => ({ ...prev, ...payload }));
      setTouchedSecrets({});
      toast.success(
        `Saved ${changedKeys.length} setting${changedKeys.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setValues(original);
    setTouchedSecrets({});
  }

  return (
    <PermissionGate
      permission="settings:manage"
      fallback={
        <div className="space-y-6">
          <PageHeader title="System Settings" description="Grouped, typed system settings for every app." />
          <Card>
            <CardContent>
              <EmptyState
                icon={<Warning className="h-6 w-6 text-muted-foreground" />}
                title="You don't have access"
                description="System settings require the settings:manage permission. Ask an administrator to grant it."
              />
            </CardContent>
          </Card>
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="System Settings"
          description="Grouped, typed configuration for every Vision7 app — rendered live from the backend catalog."
          onRefresh={load}
          actions={
            <div className="flex items-center gap-2">
              {dirty && (
                <Button variant="ghost" onClick={handleReset} disabled={saving}>
                  Reset
                </Button>
              )}
              <Button onClick={handleSave} disabled={!dirty || saving}>
                <Save className="h-4 w-4" />
                {saving
                  ? "Saving…"
                  : dirty
                    ? `Save ${changedKeys.length} change${changedKeys.length === 1 ? "" : "s"}`
                    : "Save changes"}
              </Button>
            </div>
          }
        />

        {loading ? (
          <div className="space-y-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-40" />
                </CardHeader>
                <CardContent className="space-y-6">
                  {Array.from({ length: 3 }).map((__, j) => (
                    <div key={j} className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-9 w-full max-w-md" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={<Warning className="h-6 w-6 text-destructive" />}
                title="Couldn't load settings"
                description={error}
              />
            </CardContent>
          </Card>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={<Settings className="h-6 w-6 text-muted-foreground" />}
                title="No settings defined"
                description="The backend settings catalog is empty. Settings will appear here once they're registered."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <BiostarConnectionCard />
            {groups.map(([group, entries]) => (
              <Card key={group}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    {groupTitle(group)}
                  </CardTitle>
                  <CardDescription>
                    {entries.length} setting{entries.length === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {entries.map((meta, idx) => (
                    <div key={meta.key}>
                      {idx > 0 && <Separator className="mb-6" />}
                      <SettingField
                        meta={meta}
                        value={values[meta.key] ?? ""}
                        onChange={(next) => setValue(meta, next)}
                        disabled={saving}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PermissionGate>
  );
}

// ─── Single setting row, rendered by type ────────────────────────────────────────

interface SettingFieldProps {
  meta: SettingMeta;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

function SettingField({ meta, value, onChange, disabled }: SettingFieldProps) {
  const fieldId = `setting-${meta.key}`;

  const labelRow = (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={fieldId}>{meta.label || meta.key}</Label>
      <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
        {meta.key}
      </code>
      {meta.public && (
        <Badge variant="outline" className="gap-1 text-[10px]">
          <Eye className="h-3 w-3" />
          Public
        </Badge>
      )}
      {meta.secret && (
        <Badge
          variant="outline"
          className="gap-1 border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
        >
          <Warning className="h-3 w-3" />
          Secret
        </Badge>
      )}
    </div>
  );

  // bool → Switch (inline with the label).
  if (meta.type === "bool") {
    const checked = value === "true" || value === "1";
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {labelRow}
          <p className="text-xs text-muted-foreground">
            {checked ? "Enabled" : "Disabled"}
          </p>
        </div>
        <Switch
          id={fieldId}
          checked={checked}
          onCheckedChange={(next: boolean) => onChange(next ? "true" : "false")}
          disabled={disabled}
        />
      </div>
    );
  }

  // json → Textarea.
  if (meta.type === "json") {
    return (
      <div className="space-y-2">
        {labelRow}
        <Textarea
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={6}
          spellCheck={false}
          placeholder='{ }'
          className="font-mono text-xs"
        />
      </div>
    );
  }

  // secret → password Input, mask placeholder.
  if (meta.type === "secret") {
    return (
      <div className="space-y-2">
        {labelRow}
        <Input
          id={fieldId}
          type="password"
          value={value === MASK ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete="new-password"
          placeholder={MASK}
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          Leave blank to keep the current value. Saved secrets are write-only.
        </p>
      </div>
    );
  }

  // number → number Input.
  if (meta.type === "number") {
    return (
      <div className="space-y-2">
        {labelRow}
        <Input
          id={fieldId}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="max-w-xs"
        />
      </div>
    );
  }

  // string (default) → text Input.
  return (
    <div className="space-y-2">
      {labelRow}
      <Input
        id={fieldId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="max-w-md"
      />
    </div>
  );
}

// ─── BioStar connection — Test connection helper ─────────────────────────────────
//
// The BioStar connection fields (host, port, app login id, app password, agent
// key, enabled, dry-run, enrollment reader) live in the catalog below under the
// "Integrations Biostar" group — they're rendered like any other typed setting,
// with the password + agent key masked/write-only. This card sits on top of them
// to explain the integration and offer a live "Test connection" that pings the
// on-premise agent's last heartbeat + device inventory via the access-control
// status endpoint.

interface BiostarStatus {
  agentOnline: boolean;
  lastSyncAt: string | null;
  deviceCount: number;
  onlineDeviceCount: number;
  dryRun: boolean;
  enabled?: boolean;
}

function BiostarConnectionCard() {
  const { can } = usePermissions();
  const canView = can("accesscontrol:view");
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<BiostarStatus | null>(null);
  const [tested, setTested] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!canView) return null;

  async function runTest() {
    setTesting(true);
    setErrored(false);
    try {
      const res = (await api.accessControl.status()) as BiostarStatus;
      setStatus(res);
      setTested(true);
      if (res.agentOnline) {
        toast.success(
          `Agent online — ${res.onlineDeviceCount}/${res.deviceCount} devices reporting`,
        );
      } else {
        toast.warning("Agent has not reported recently — check the on-premise agent.");
      }
    } catch (err) {
      setErrored(true);
      setStatus(null);
      setTested(true);
      toast.error(err instanceof Error ? err.message : "Couldn't reach the access-control service");
    } finally {
      setTesting(false);
    }
  }

  const online = tested && !errored && status?.agentOnline;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DoorOpen className="h-4 w-4 text-muted-foreground" />
          BioStar Card Access
        </CardTitle>
        <CardDescription>
          Configure the BioStar connection (fields below) and confirm the on-premise
          agent is reporting. The backend never talks to BioStar directly — a local
          agent pulls config + jobs and pushes inventory + events back.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={runTest} disabled={testing} variant="outline">
            {testing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : online ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
            {testing ? "Testing…" : "Test connection"}
          </Button>

          {tested && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge
                variant="outline"
                className={
                  online
                    ? "gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "gap-1 border-destructive/30 bg-destructive/10 text-destructive"
                }
              >
                {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {online ? "Agent online" : errored ? "Unavailable" : "Agent offline"}
              </Badge>
              {status && (
                <>
                  <span className="text-muted-foreground">
                    {status.onlineDeviceCount}/{status.deviceCount} devices online
                  </span>
                  {status.lastSyncAt && (
                    <span className="text-muted-foreground">
                      · last sync{" "}
                      {new Date(status.lastSyncAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {status.dryRun && (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                      Dry-run mode
                    </Badge>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Dry-run mode logs intended BioStar writes without applying them — keep it on
          until the agent is verified on site.
        </p>
      </CardContent>
    </Card>
  );
}
