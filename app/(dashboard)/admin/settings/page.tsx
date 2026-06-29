"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
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
import { Settings, Save, Eye, Warning, DoorOpen, Wifi, WifiOff, RefreshCw, Download } from "@/lib/icons";
import { relayHealth, type RelayHealth } from "@/lib/biostar-relay";

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

            {/* Context + live "Test connection" for the BioStar relay. The relay URL
                itself is a catalog key (group "BioStar"), already edited by the form
                above; this card adds context and a browser-side reachability probe. */}
            <BiostarRelayCard relayUrl={values["integrations.biostar.relay_url"] ?? ""} />
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

// ─── BioStar relay context card (read-only context + Test connection) ─────────────

function BiostarRelayCard({ relayUrl }: { relayUrl: string }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<RelayHealth | null>(null);

  const url = (relayUrl || "").trim();

  async function test() {
    if (!url) {
      toast.error("Set the BioStar Relay URL above first, then save and test.");
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const health = await relayHealth(url);
      setResult(health);
      if (health.ok) toast.success("Relay is online");
      else toast.error(health.error || "Relay did not respond");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Relay unreachable";
      setResult({ ok: false, reachable: false, error: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DoorOpen className="h-4 w-4 text-muted-foreground" />
          BioStar Relay
        </CardTitle>
        <CardDescription>
          The CRM pushes cards & door access to BioStar through an on-premises relay
          (CORS + self-signed cert solved there). Set its URL above in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">integrations.biostar.relay_url</code>{" "}
          (e.g. <code className="rounded bg-muted px-1 py-0.5 text-[11px]">https://192.168.1.50:8443</code>),
          save, then test the connection here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={test} disabled={testing || !url} variant="outline">
            <RefreshCw className={cn("h-4 w-4", testing && "animate-spin")} />
            {testing ? "Testing…" : "Test connection"}
          </Button>

          {result && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "gap-1",
                  result.ok
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {result.ok ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {result.ok ? "Relay online" : "Relay offline"}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "gap-1",
                  result.reachable
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                )}
              >
                {result.reachable ? "BioStar reachable" : "BioStar not reachable"}
              </Badge>
            </div>
          )}
        </div>

        {result?.error && <p className="text-xs text-destructive">{result.error}</p>}
        {result?.biostar && !result.error && (
          <p className="text-xs text-muted-foreground">BioStar: {result.biostar}</p>
        )}

        <p className="text-xs text-muted-foreground">
          Tip: trust the relay&apos;s certificate once per browser — open{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{url || "https://<relay-ip>:8443"}/relay/health</code>{" "}
          and accept the warning. After that, the CRM&apos;s calls to the relay work.
        </p>

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button variant="outline" render={<a href="/downloads/vision7-biostar-relay.zip" download />}>
            <Download className="h-4 w-4" />
            Download relay
          </Button>
          <p className="text-xs text-muted-foreground">
            Run it on a premises PC (needs Node 18+): unzip, copy{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">config.env.example</code> →{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">config.env</code> (BioStar host + a login +
            this CRM&apos;s origin), then run <code className="rounded bg-muted px-1 py-0.5 text-[11px]">start.cmd</code>.
            Full steps in the README inside.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
