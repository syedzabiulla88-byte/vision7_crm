"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, GenericTable, Loading, timeAgo, useAsync } from "./_shared";

const KINDS = [
  { value: "sessions", label: "All sessions (org)" },
  { value: "machine-activity", label: "Machine activity" },
  { value: "coaches", label: "Coaches" },
  { value: "nfc-cards", label: "NFC wristbands" },
  { value: "roster", label: "Coach roster (players)" },
] as const;

/** Stored datasets from ESA's signed manager API (needs the HMAC secret); the roster is a small live read. */
export function ManagerTab({ rev }: { rev: string }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("machine-activity");
  const [coachId, setCoachId] = useState("");
  const [search, setSearch] = useState("");

  const { data, error, loading } = useAsync(
    async () => (kind === "roster" ? api.esa.hub.coachRoster({ coachId: coachId || undefined }) : api.esa.hub.manager(kind)),
    `mgr:${kind}|${coachId}|${rev}`,
    { keepPrevious: true },
  );

  const rows: any[] = (data?.rows ?? []).filter((r: any) => {
    const t = search.trim().toLowerCase();
    return !t || JSON.stringify(r).toLowerCase().includes(t);
  });
  const missing = kind !== "roster" && data && !data.available;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <Button key={k.value} size="sm" variant={kind === k.value ? "default" : "outline"} onClick={() => setKind(k.value)}>
            {k.label}
          </Button>
        ))}
      </div>

      {kind === "roster" ? (
        <Input placeholder="Coach ID (optional — defaults to the integration account)" value={coachId} onChange={(e) => setCoachId(e.target.value)} className="max-w-sm" />
      ) : (
        <Input placeholder="Search these rows…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      )}

      <ErrorNote message={error} />
      {loading && !data ? (
        <Loading />
      ) : missing ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {data.signedReads
            ? "Nothing stored yet for this dataset — run Sync now."
            : "This dataset comes from ESA's signed manager API. Add the Vision 7 HMAC secret in Settings → Integrations (“ESA Vision 7 HMAC secret”), then run Sync now."}
        </p>
      ) : (
        <>
          {kind !== "roster" && data?.fetchedAt && (
            <p className="text-xs text-muted-foreground">
              {rows.length} of {data.rows.length} rows · pulled {timeAgo(data.fetchedAt)}
            </p>
          )}
          <GenericTable rows={rows.slice(0, 200)} />
          {rows.length > 200 && <p className="text-xs text-muted-foreground">Showing the first 200 rows — narrow with search.</p>}
        </>
      )}
    </div>
  );
}
