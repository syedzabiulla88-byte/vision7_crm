"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, UserAdd } from "@/lib/icons";

// ─── Option lists (ported from site/src/app/admin/crm/new/page.js) ──────────────

const TYPES = [
  { value: "LEAD", label: "Lead" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "MEMBER", label: "Member" },
  { value: "FORMER", label: "Former" },
];
const SOURCES = [
  { value: "walkin", label: "Walk-in" },
  { value: "website", label: "Website enquiry" },
  { value: "referral", label: "Referral" },
  { value: "social", label: "Social media" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
];
const GENDERS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];
const ID_TYPES = [
  { value: "", label: "—" },
  { value: "NATIONAL_ID", label: "National ID" },
  { value: "IQAMA", label: "Iqama" },
  { value: "PASSPORT", label: "Passport" },
];
const MARITAL_STATUSES = [
  { value: "", label: "—" },
  { value: "SINGLE", label: "Single" },
  { value: "MARRIED", label: "Married" },
  { value: "DIVORCED", label: "Divorced" },
  { value: "WIDOWED", label: "Widowed" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];
const WORK_STATUSES = [
  { value: "", label: "—" },
  { value: "EMPLOYED", label: "Employed" },
  { value: "SELF_EMPLOYED", label: "Self-employed" },
  { value: "UNEMPLOYED", label: "Unemployed" },
  { value: "STUDENT", label: "Student" },
  { value: "RETIRED", label: "Retired" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];
const PREFERRED_LANGUAGES = [
  { value: "", label: "—" },
  { value: "ARABIC", label: "Arabic" },
  { value: "ENGLISH", label: "English" },
];
const CLIENT_GOALS = [
  { value: "", label: "—" },
  { value: "WEIGHT_LOSS", label: "Weight Loss" },
  { value: "MUSCLE_BUILDING", label: "Muscle Building" },
  { value: "IMPROVE_FITNESS", label: "Improve Fitness Level" },
  { value: "BETTER_SOCIAL_LIFE", label: "Better Social Life" },
  { value: "POST_INJURY_REHAB", label: "Post-Injury Rehabilitation" },
  { value: "IMPROVE_FLEXIBILITY", label: "Improve Flexibility" },
  { value: "EVENT_PREPARATION", label: "Event/Competition Preparation" },
  { value: "STRESS_RELIEF", label: "Stress Relief / Mental Wellbeing" },
];

type Option = { value: string; label: string };

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  type: string;
  source: string;
  tagsRaw: string;
  notes: string;
  gender: string;
  nationalId: string;
  idType: string;
  idExpiry: string;
  dob: string;
  maritalStatus: string;
  occupation: string;
  childrenCount: string;
  workStatus: string;
  workInfo: string;
  program: "academy" | "gym";
  preferredLanguage: string;
  clientGoal: string;
}

const INITIAL: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  type: "LEAD",
  source: "walkin",
  tagsRaw: "",
  notes: "",
  gender: "",
  nationalId: "",
  idType: "",
  idExpiry: "",
  dob: "",
  maritalStatus: "",
  occupation: "",
  childrenCount: "",
  workStatus: "",
  workInfo: "",
  program: "academy",
  preferredLanguage: "",
  clientGoal: "",
};

/** A labelled shadcn Select bound to an option list (empty value === "—"). */
function SelectField({
  label,
  value,
  onChange,
  options,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  id: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select items={options} value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value || "__empty"} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function NewContactPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.email.trim()) {
      toast.error("First name and email are required");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    setSaving(true);
    try {
      const tags = form.tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      // Reflect the program choice (academy vs gym) as a tag, without duplicating
      // whatever the user may have already typed.
      if (form.program && !tags.includes(form.program)) tags.push(form.program);
      const created = await api.crm.create({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        // Member status is system-managed (a contact becomes a MEMBER only when a plan
        // is assigned in the Members page). New contacts default to LEAD server-side.
        source: form.source,
        tags,
        notes: form.notes.trim() || undefined,
        gender: form.gender || undefined,
        nationalId: form.nationalId.trim() || undefined,
        idType: form.idType || undefined,
        idExpiry: form.idExpiry || null,
        dob: form.dob || undefined,
        maritalStatus: form.maritalStatus || undefined,
        occupation: form.occupation.trim() || undefined,
        childrenCount: form.childrenCount === "" ? undefined : Number(form.childrenCount),
        workStatus: form.workStatus || undefined,
        workInfo: form.workInfo.trim() || undefined,
        preferredLanguage: form.preferredLanguage || undefined,
        clientGoal: form.clientGoal || undefined,
      });
      toast.success("Contact created");
      router.push(`/crm/${created?.id || ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create contact");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/crm"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Contacts
        </Link>
        <PageHeader title="Add Contact" description="Capture a new lead, customer, or member." />
      </div>

      <form onSubmit={submit} className="space-y-6">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                required
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">
                Phone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+966 5X XXX XXXX"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Program — Academy / Leisure selector + conditional wellness fields */}
        <Card>
          <CardHeader>
            <CardTitle>Program</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Interested in</Label>
              <div className="inline-flex rounded-md border p-0.5">
                {(
                  [
                    { value: "academy", label: "Academy" },
                    { value: "gym", label: "Leisure" },
                  ] as const
                ).map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={form.program === opt.value ? "default" : "ghost"}
                    onClick={() => set("program", opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            {form.program === "gym" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SelectField
                  id="clientGoal"
                  label="Client goal"
                  value={form.clientGoal}
                  onChange={(v) => set("clientGoal", v)}
                  options={CLIENT_GOALS}
                />
                <SelectField
                  id="preferredLanguage"
                  label="Preferred language"
                  value={form.preferredLanguage}
                  onChange={(v) => set("preferredLanguage", v)}
                  options={PREFERRED_LANGUAGES}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Academy contact — football academy enrolment and athlete tracking.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Demographics */}
        <Card>
          <CardHeader>
            <CardTitle>Demographics</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              id="gender"
              label="Gender"
              value={form.gender}
              onChange={(v) => set("gender", v)}
              options={GENDERS}
            />
            <div className="space-y-2">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                type="date"
                value={form.dob}
                onChange={(e) => set("dob", e.target.value)}
              />
            </div>
            <SelectField
              id="idType"
              label="ID type"
              value={form.idType}
              onChange={(v) => set("idType", v)}
              options={ID_TYPES}
            />
            <div className="space-y-2">
              <Label htmlFor="nationalId">National ID / document no.</Label>
              <Input
                id="nationalId"
                value={form.nationalId}
                onChange={(e) => set("nationalId", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idExpiry">ID expiry date</Label>
              <Input
                id="idExpiry"
                type="date"
                value={form.idExpiry}
                onChange={(e) => set("idExpiry", e.target.value)}
              />
            </div>
            <SelectField
              id="maritalStatus"
              label="Marital status"
              value={form.maritalStatus}
              onChange={(v) => set("maritalStatus", v)}
              options={MARITAL_STATUSES}
            />
            <div className="space-y-2">
              <Label htmlFor="childrenCount">Children</Label>
              <Input
                id="childrenCount"
                type="number"
                min="0"
                placeholder="0"
                value={form.childrenCount}
                onChange={(e) => set("childrenCount", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="occupation">Occupation</Label>
              <Input
                id="occupation"
                value={form.occupation}
                onChange={(e) => set("occupation", e.target.value)}
              />
            </div>
            <SelectField
              id="workStatus"
              label="Work status"
              value={form.workStatus}
              onChange={(v) => set("workStatus", v)}
              options={WORK_STATUSES}
            />
            <div className="space-y-2">
              <Label htmlFor="workInfo">Work info</Label>
              <Input
                id="workInfo"
                placeholder="Employer, role, sector…"
                value={form.workInfo}
                onChange={(e) => set("workInfo", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Classification */}
        <Card>
          <CardHeader>
            <CardTitle>Classification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectField
                id="source"
                label="Source"
                value={form.source}
                onChange={(v) => set("source", v)}
                options={SOURCES}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                placeholder="padel, gym, parent, VIP"
                value={form.tagsRaw}
                onChange={(e) => set("tagsRaw", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              placeholder="Anything staff should know when reaching out…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            <UserAdd className="h-4 w-4" />
            {saving ? "Saving…" : "Create Contact"}
          </Button>
          <Button type="button" variant="outline" render={<Link href="/crm" />}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
