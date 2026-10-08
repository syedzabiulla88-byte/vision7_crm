"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttributeBars, ErrorNote, Loading, Stat, useAsync } from "./_shared";

export function TeamsTab() {
  const { data: teams, error, loading } = useAsync(() => api.esa.hub.teams(), "teams");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      {loading && !teams ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(teams ?? []).length === 0 && <p className="text-sm text-muted-foreground">No teams yet.</p>}
          {(teams ?? []).map((t: any) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t.id)}
              className={`rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 ${selected === t.id ? "border-[#FFCF01] bg-muted/40" : "border-border"}`}
            >
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.ageGroup}</p>
              <p className="mt-2 text-xs">
                {t.athletes} athlete{t.athletes === 1 ? "" : "s"} · <span className="font-medium">{t.esaLinked} on ESA</span>
              </p>
            </button>
          ))}
        </div>
      )}
      {selected && <TeamPerformance id={selected} key={selected} />}
    </div>
  );
}

function TeamPerformance({ id }: { id: string }) {
  const { data, error, loading } = useAsync(() => api.esa.hub.team(id), `team:${id}`);
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;
  const c = data.coverage;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Team ESA Index" value={data.teamAverage ?? "—"} hint={data.team.name} />
        <Stat label="Athletes" value={c.athletes} />
        <Stat label="On ESA" value={c.linked} />
        <Stat label="With Index data" value={c.withData} hint="Average counts only these" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Team attributes</CardTitle>
        </CardHeader>
        <CardContent>
          <AttributeBars values={data.attributeAverages} />
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Athlete</TableHead>
              <TableHead>ESA username</TableHead>
              <TableHead>ESA Index</TableHead>
              <TableHead>Level</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.members.map((m: any) => (
              <TableRow key={m.athleteId}>
                <TableCell>{m.name}</TableCell>
                <TableCell className="font-mono text-xs">{m.username ?? <Badge variant="outline">Not on ESA</Badge>}</TableCell>
                <TableCell className="font-semibold">
                  {m.average ?? (m.error ? <span className="text-xs font-normal text-destructive">{m.error}</span> : "—")}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{m.level ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
