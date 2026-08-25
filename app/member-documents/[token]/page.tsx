"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NATIONALITY_OPTIONS } from "@/lib/nationalities";

type StaticSection = { heading: string; items: string[] };
type StaticContent = { title: string; subtitle: string; intro: string; sections: StaticSection[] };

export default function MemberDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Static (Handbook/Etiquette)
  const [staticAgree, setStaticAgree] = useState(false);

  // PARQ
  const [healthAnswers, setHealthAnswers] = useState<Record<number, boolean>>({});
  const [wellnessAnswers, setWellnessAnswers] = useState<Record<number, boolean>>({});
  const [parqNotes, setParqNotes] = useState("");
  const [parqDeclarations, setParqDeclarations] = useState<Record<number, boolean>>({});

  // Contract
  const [nationality, setNationality] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const [ackChecked, setAckChecked] = useState<Record<number, boolean>>({});
  const [finalChecked, setFinalChecked] = useState<Record<number, boolean>>({});
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("");
  const [guardianMobile, setGuardianMobile] = useState("");
  const [guardianId, setGuardianId] = useState("");

  useEffect(() => {
    if (!token) return;
    api.memberDocuments
      .getPublic(String(token))
      .then((res: any) => setDoc(res?.data ?? res))
      .catch((e: any) => setError(e?.message || "This link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">{error || "This link is invalid or has expired."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done || doc.status === "COMPLETED" || doc.status === "STAFF_REVIEW_NEEDED") {
    const alreadySubmitted = doc.status === "STAFF_REVIEW_NEEDED" || doc.status === "COMPLETED";
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
        <Card className="max-w-md">
          <CardContent className="space-y-3 p-6 text-center">
            <h1 className="text-lg font-semibold">
              {doc.type === "PARQ" && !pdfUrl ? "Submitted — pending review" : "Thank you"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {doc.type === "PARQ"
                ? "Your health screening has been submitted. A Vision7 team member will review it before you begin activity."
                : alreadySubmitted && !done
                  ? "This document has already been completed."
                  : "Your response has been recorded."}
            </p>
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary underline">
                Download your signed Membership Agreement (PDF)
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const submit = async (payload: any) => {
    setSubmitting(true);
    try {
      const res: any = await api.memberDocuments.submitPublic(String(token), payload);
      const data = res?.data ?? res;
      if (data?.contractPdfUrl) setPdfUrl(data.contractPdfUrl);
      setDone(true);
    } catch (e: any) {
      setError(e?.message || "Something went wrong submitting this — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vision7</p>
          <h1 className="text-2xl font-bold">
            {doc.type === "CONTRACT" ? "Membership Agreement" : doc.type === "PARQ" ? "PAR-Q & Health Screening" : doc.content?.title}
          </h1>
          {doc.memberName && <p className="mt-1 text-sm text-muted-foreground">for {doc.memberName}</p>}
        </div>

        {(doc.type === "HANDBOOK" || doc.type === "ETIQUETTE") && (
          <StaticDocView
            content={doc.content as StaticContent}
            agreed={staticAgree}
            onAgree={setStaticAgree}
            submitting={submitting}
            onSubmit={() => submit({ agreedAt: new Date().toISOString() })}
          />
        )}

        {doc.type === "PARQ" && (
          <ParqView
            healthQuestions={doc.healthQuestions as string[]}
            wellnessQuestions={doc.wellnessQuestions as string[]}
            declarations={doc.declarations as string[]}
            healthAnswers={healthAnswers}
            setHealthAnswers={setHealthAnswers}
            wellnessAnswers={wellnessAnswers}
            setWellnessAnswers={setWellnessAnswers}
            notes={parqNotes}
            setNotes={setParqNotes}
            declarationChecks={parqDeclarations}
            setDeclarationChecks={setParqDeclarations}
            submitting={submitting}
            onSubmit={() =>
              submit({
                healthAnswers,
                wellnessAnswers,
                notes: parqNotes,
                declarations: parqDeclarations,
                submittedAt: new Date().toISOString(),
              })
            }
          />
        )}

        {doc.type === "CONTRACT" && (
          <ContractView
            doc={doc}
            nationality={nationality}
            setNationality={setNationality}
            emergencyContactName={emergencyContactName}
            setEmergencyContactName={setEmergencyContactName}
            emergencyContactNumber={emergencyContactNumber}
            setEmergencyContactNumber={setEmergencyContactNumber}
            ackChecked={ackChecked}
            setAckChecked={setAckChecked}
            finalChecked={finalChecked}
            setFinalChecked={setFinalChecked}
            guardianName={guardianName}
            setGuardianName={setGuardianName}
            guardianRelationship={guardianRelationship}
            setGuardianRelationship={setGuardianRelationship}
            guardianMobile={guardianMobile}
            setGuardianMobile={setGuardianMobile}
            guardianId={guardianId}
            setGuardianId={setGuardianId}
            submitting={submitting}
            onSubmit={() =>
              submit({
                nationality,
                emergencyContactName,
                emergencyContactNumber,
                acknowledgement: ackChecked,
                finalDeclaration: finalChecked,
                guardian: doc.requiresGuardianConsent
                  ? { name: guardianName, relationship: guardianRelationship, mobile: guardianMobile, idNumber: guardianId }
                  : undefined,
                signedAt: new Date().toISOString(),
              })
            }
          />
        )}

        {error && <p className="text-center text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function StaticDocView({
  content,
  agreed,
  onAgree,
  submitting,
  onSubmit,
}: {
  content: StaticContent;
  agreed: boolean;
  onAgree: (v: boolean) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <p className="text-sm text-muted-foreground">{content.intro}</p>
        {content.sections.map((s) => (
          <div key={s.heading} className="space-y-2">
            <h2 className="text-sm font-semibold">{s.heading}</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {s.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t pt-4">
          <Checkbox checked={agreed} onCheckedChange={(v) => onAgree(!!v)} id="agree" />
          <Label htmlFor="agree" className="text-sm">
            I have read and understood this document.
          </Label>
        </div>
        <Button className="w-full" disabled={!agreed || submitting} onClick={onSubmit}>
          {submitting ? "Submitting…" : "Confirm"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ParqView(props: {
  healthQuestions: string[];
  wellnessQuestions: string[];
  declarations: string[];
  healthAnswers: Record<number, boolean>;
  setHealthAnswers: (v: Record<number, boolean>) => void;
  wellnessAnswers: Record<number, boolean>;
  setWellnessAnswers: (v: Record<number, boolean>) => void;
  notes: string;
  setNotes: (v: string) => void;
  declarationChecks: Record<number, boolean>;
  setDeclarationChecks: (v: Record<number, boolean>) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const {
    healthQuestions, wellnessQuestions, declarations,
    healthAnswers, setHealthAnswers, wellnessAnswers, setWellnessAnswers,
    notes, setNotes, declarationChecks, setDeclarationChecks, submitting, onSubmit,
  } = props;
  const allAnswered =
    healthQuestions.every((_, i) => healthAnswers[i] !== undefined) &&
    wellnessQuestions.every((_, i) => wellnessAnswers[i] !== undefined);
  const allDeclared = declarations.every((_, i) => declarationChecks[i]);

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <p className="text-sm text-muted-foreground">
          Please answer every question honestly. A "Yes" answer does not always mean you cannot train, but it does
          mean Vision7 needs to review your answer before activity begins.
        </p>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Health Screening Questions</h2>
          {healthQuestions.map((q, i) => (
            <YesNoRow key={i} question={q} value={healthAnswers[i]} onChange={(v) => setHealthAnswers({ ...healthAnswers, [i]: v })} />
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Wellness Area Screening (pool, sauna, steam, recovery)</h2>
          {wellnessQuestions.map((q, i) => (
            <YesNoRow key={i} question={q} value={wellnessAnswers[i]} onChange={(v) => setWellnessAnswers({ ...wellnessAnswers, [i]: v })} />
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="parq-notes">Injury, movement or training notes (optional)</Label>
          <Textarea id="parq-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        <div className="space-y-2 border-t pt-4">
          <h2 className="text-sm font-semibold">Member Declaration</h2>
          {declarations.map((d, i) => (
            <div key={i} className="flex items-start gap-2">
              <Checkbox
                checked={!!declarationChecks[i]}
                onCheckedChange={(v) => setDeclarationChecks({ ...declarationChecks, [i]: !!v })}
                id={`decl-${i}`}
              />
              <Label htmlFor={`decl-${i}`} className="text-sm font-normal">{d}</Label>
            </div>
          ))}
        </div>

        <Button className="w-full" disabled={!allAnswered || !allDeclared || submitting} onClick={onSubmit}>
          {submitting ? "Submitting…" : "Submit health screening"}
        </Button>
      </CardContent>
    </Card>
  );
}

function YesNoRow({ question, value, onChange }: { question: string; value?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm">
      <span className="flex-1">{question}</span>
      <div className="flex shrink-0 gap-2">
        <Button type="button" size="sm" variant={value === true ? "default" : "outline"} onClick={() => onChange(true)}>
          Yes
        </Button>
        <Button type="button" size="sm" variant={value === false ? "default" : "outline"} onClick={() => onChange(false)}>
          No
        </Button>
      </div>
    </div>
  );
}

function ContractView(props: {
  doc: any;
  nationality: string;
  setNationality: (v: string) => void;
  emergencyContactName: string;
  setEmergencyContactName: (v: string) => void;
  emergencyContactNumber: string;
  setEmergencyContactNumber: (v: string) => void;
  ackChecked: Record<number, boolean>;
  setAckChecked: (v: Record<number, boolean>) => void;
  finalChecked: Record<number, boolean>;
  setFinalChecked: (v: Record<number, boolean>) => void;
  guardianName: string;
  setGuardianName: (v: string) => void;
  guardianRelationship: string;
  setGuardianRelationship: (v: string) => void;
  guardianMobile: string;
  setGuardianMobile: (v: string) => void;
  guardianId: string;
  setGuardianId: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const {
    doc, nationality, setNationality, emergencyContactName, setEmergencyContactName,
    emergencyContactNumber, setEmergencyContactNumber, ackChecked, setAckChecked,
    finalChecked, setFinalChecked, guardianName, setGuardianName, guardianRelationship,
    setGuardianRelationship, guardianMobile, setGuardianMobile, guardianId, setGuardianId,
    submitting, onSubmit,
  } = props;

  const allAck = (doc.acknowledgementItems as string[]).every((_, i) => ackChecked[i]);
  const allFinal = (doc.finalDeclarationItems as string[]).every((_, i) => finalChecked[i]);
  const guardianOk = !doc.requiresGuardianConsent || (guardianName && guardianRelationship && guardianMobile && guardianId);
  const canSubmit = allAck && allFinal && guardianOk && emergencyContactName && emergencyContactNumber;

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="space-y-2 text-sm">
          <h2 className="font-semibold">Membership Summary</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <span>Full name</span><span className="text-foreground">{doc.member?.name}</span>
            <span>Email</span><span className="text-foreground">{doc.member?.email || "—"}</span>
            <span>Mobile</span><span className="text-foreground">{doc.member?.phone || "—"}</span>
            <span>Membership type</span><span className="text-foreground">{doc.membership?.type || "—"}</span>
            <span>Start date</span>
            <span className="text-foreground">{doc.membership?.startDate ? new Date(doc.membership.startDate).toLocaleDateString() : "—"}</span>
            <span>Fee</span><span className="text-foreground">{doc.membership?.fee || "—"}</span>
            <span>Auto-renewal</span><span className="text-foreground">{doc.membership?.autoRenewal ? "Yes" : "No"}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="nationality">Nationality</Label>
            <Select items={NATIONALITY_OPTIONS} value={nationality} onValueChange={(v) => setNationality(v ?? "")}>
              <SelectTrigger id="nationality" className="w-full">
                <SelectValue placeholder="Select nationality…" />
              </SelectTrigger>
              <SelectContent>
                {NATIONALITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div />
          <div className="space-y-1">
            <Label htmlFor="ec-name">Emergency contact name</Label>
            <Input id="ec-name" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ec-number">Emergency contact number</Label>
            <Input id="ec-number" value={emergencyContactNumber} onChange={(e) => setEmergencyContactNumber(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <h2 className="text-sm font-semibold">Member Acknowledgement</h2>
          <p className="text-xs text-muted-foreground">By confirming below, you agree that you have read and accepted:</p>
          {(doc.acknowledgementItems as string[]).map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <Checkbox checked={!!ackChecked[i]} onCheckedChange={(v) => setAckChecked({ ...ackChecked, [i]: !!v })} id={`ack-${i}`} />
              <Label htmlFor={`ack-${i}`} className="text-sm font-normal">{item}</Label>
            </div>
          ))}
        </div>

        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Read full Terms and Conditions</summary>
          <div className="mt-3 max-h-96 space-y-3 overflow-y-auto pr-2">
            {(doc.terms as { heading: string; body: string[] }[]).map((section) => (
              <div key={section.heading}>
                <p className="font-medium">{section.heading}</p>
                {section.body.map((p, i) => (
                  <p key={i} className="mt-1 text-xs text-muted-foreground">{p}</p>
                ))}
              </div>
            ))}
          </div>
        </details>

        <div className="space-y-2 border-t pt-4">
          <h2 className="text-sm font-semibold">Final Declaration</h2>
          {(doc.finalDeclarationItems as string[]).map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <Checkbox checked={!!finalChecked[i]} onCheckedChange={(v) => setFinalChecked({ ...finalChecked, [i]: !!v })} id={`final-${i}`} />
              <Label htmlFor={`final-${i}`} className="text-sm font-normal">{item}</Label>
            </div>
          ))}
        </div>

        {doc.requiresGuardianConsent && (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold">Guardian Consent (member is under 18)</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="g-name">Parent/Guardian name</Label>
                <Input id="g-name" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="g-rel">Relationship</Label>
                <Input id="g-rel" value={guardianRelationship} onChange={(e) => setGuardianRelationship(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="g-mobile">Mobile number</Label>
                <Input id="g-mobile" value={guardianMobile} onChange={(e) => setGuardianMobile(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="g-id">ID / Iqama / Passport No.</Label>
                <Input id="g-id" value={guardianId} onChange={(e) => setGuardianId(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <Button className="w-full" disabled={!canSubmit || submitting} onClick={onSubmit}>
          {submitting ? "Submitting…" : "Sign & Submit Agreement"}
        </Button>
      </CardContent>
    </Card>
  );
}
