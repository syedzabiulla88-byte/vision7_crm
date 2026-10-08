"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, GenericTable, Loading, useAsync } from "./_shared";

const KINDS = [
  { value: "sessions", label: "All sessions", signed: true },
  { value: "machine-activity", label: "Machine activity", signed: true },
  { value: "coaches", label: "Coaches", signed: true },
  { value: "nfc-cards", label: "NFC wristbands", signed: true },
  { value: "roster", label: "Coach roster (players)", signed: false },
] as const;

export function ManagerTab({ signedReads }: { signedReads: boolean }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("sessions");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [coachId, setCoachId] = useState("");
  const meta = KINDS.find((k) => k.value === kind)!;
  const blocked = meta.signed && !signedReads;

  const { data, error, loading } = useAsync(async () => {
    if (blocked) return null;
    if (kind === "roster") return api.esa.hub.coachRoster({ coachId: coachId || undefined });
    return api.esa.hub.manager(kind, { page_num: page, per_page: 25, q: search || undefined });
  }, `mgr:${kind}|${page}|${search}|${coachId}|${blocked}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <Button
            key={k.value}
            size="sm"
            variant={kind === k.value ? "default" : "outline"}
            onClick={() => {
              setKind(k.value);
              setPage(1);
            }}
          >
            {k.label}
          </Button>
        ))}
      </div>

      {blocked ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          This view uses ESA&apos;s signed manager API. Add the Vision 7 HMAC secret in Settings → Integrations (&ldquo;ESA Vision 7 HMAC secret&rdquo;) to enable it.
        </p>
      ) : (
        <>
          {kind === "roster" ? (
            <Input placeholder="Coach ID (optional — defaults to the integration account)" value={coachId} onChange={(e) => setCoachId(e.target.value)} className="max-w-sm" />
          ) : kind === "nfc-cards" ? (
            <Input placeholder="Search wristbands…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="max-w-sm" />
          ) : null}
          <ErrorNote message={error} />
          {loading ? <Loading /> : <GenericTable rows={data?.rows ?? []} />}
          {kind !== "roster" && kind !== "coaches" && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page}</span>
              <Button size="sm" variant="outline" disabled={loading || (data?.rows?.length ?? 0) < 25} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
