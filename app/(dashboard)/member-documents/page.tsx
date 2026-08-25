"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const CLEARANCE_OPTIONS = [
  { value: "CLEARED", label: "Cleared for general gym use" },
  { value: "CLEARED_WITH_RESTRICTIONS", label: "Cleared with restrictions" },
  { value: "PT_SUPERVISED_START", label: "PT / supervised start recommended" },
  { value: "CLASS_MODIFICATION", label: "Class modification required" },
  { value: "WELLNESS_RESTRICTION", label: "Wellness area restriction" },
  { value: "MEDICAL_CLEARANCE_REQUIRED", label: "Medical clearance required before activity" },
  { value: "NOT_CLEARED", label: "Not cleared today" },
];

interface PendingParq {
  id: string;
  memberName: string | null;
  memberEmail: string | null;
  submittedAt: string | null;
  submittedData: {
    healthAnswers?: Record<string, boolean>;
    wellnessAnswers?: Record<string, boolean>;
    notes?: string;
  } | null;
}

export default function MemberDocumentsPage() {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingParq[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [decision, setDecision] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.memberDocuments.pendingReview();
      setPending(Array.isArray(res) ? res : res?.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load pending reviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitReview = async (id: string) => {
    if (!decision[id]) {
      toast.error("Pick a clearance decision first");
      return;
    }
    setSaving(id);
    try {
      await api.memberDocuments.review(id, { clearanceDecision: decision[id], clearanceNotes: notes[id] });
      toast.success("Clearance recorded");
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save review");
    } finally {
      setSaving(null);
    }
  };

  const yesCount = (answers?: Record<string, boolean>) =>
    answers ? Object.values(answers).filter(Boolean).length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Member Documents"
        description="PAR-Q health screenings submitted by members, awaiting staff clearance before they can train."
        onRefresh={load}
      />

      <Card>
        <CardContent className="space-y-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : pending.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No PAR-Q submissions waiting for review.
            </div>
          ) : (
            pending.map((p) => {
              const healthYes = yesCount(p.submittedData?.healthAnswers);
              const wellnessYes = yesCount(p.submittedData?.wellnessAnswers);
              const isOpen = expanded === p.id;
              return (
                <div key={p.id} className="rounded-md border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                  >
                    <div>
                      <p className="font-medium">{p.memberName || "Unknown member"}</p>
                      <p className="text-xs text-muted-foreground">{p.memberEmail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {healthYes > 0 && (
                        <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          {healthYes} health "Yes"
                        </Badge>
                      )}
                      {wellnessYes > 0 && (
                        <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          {wellnessYes} wellness "Yes"
                        </Badge>
                      )}
                      {healthYes === 0 && wellnessYes === 0 && (
                        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                          All clear
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="space-y-4 border-t p-4">
                      {p.submittedData?.notes && (
                        <div className="rounded-md bg-muted/30 p-3 text-sm">
                          <p className="mb-1 font-medium">Member notes</p>
                          <p className="text-muted-foreground">{p.submittedData.notes}</p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Clearance decision</label>
                        <Select
                          items={CLEARANCE_OPTIONS}
                          value={decision[p.id] || ""}
                          onValueChange={(v) => setDecision((prev) => ({ ...prev, [p.id]: v || "" }))}
                        >
                          <SelectTrigger className="w-full sm:w-96">
                            <SelectValue placeholder="Select a decision…" />
                          </SelectTrigger>
                          <SelectContent>
                            {CLEARANCE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Notes (optional)</label>
                        <Textarea
                          value={notes[p.id] || ""}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="Restrictions, follow-up needed, etc."
                          rows={2}
                        />
                      </div>

                      <Button onClick={() => submitReview(p.id)} disabled={saving === p.id}>
                        {saving === p.id ? "Saving…" : "Save clearance decision"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
