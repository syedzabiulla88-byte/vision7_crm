import { api } from "@/lib/api";

// Provision (or reuse) the athlete profile an academy plan needs for a CRM
// contact. Encodes the two ways this used to 500 on the API:
//
//  1. Contact has no email → the athlete needs one (it becomes the app login).
//     The caller collects it; we save it on the contact FIRST (server-side
//     format + clash checks) so the athlete and contact stay one identity.
//  2. An athlete already exists for that email → reuse it and link the contact
//     to it (ensure-contact dedups by email) instead of creating a duplicate.

export interface ProvisionResult {
  athleteId: string;
  /** true when an existing athlete profile was reused instead of created */
  reused: boolean;
  /** set when the athlete is anchored to a DIFFERENT contact record (a duplicate) */
  linkedElsewhereId?: string;
}

export async function provisionAthleteForContact(args: {
  contact: { id: string; email?: string | null };
  /** email typed in the dialog when the contact has none */
  email?: string;
  /** full POST /athletes body minus the email */
  payload: Record<string, unknown>;
}): Promise<ProvisionResult> {
  const { contact, payload } = args;
  const email = String(args.email || contact.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new Error("An email is required to create the athlete profile (it becomes their app login).");
  }

  // Save a newly supplied email on the contact first (validates + clash-checks).
  if (email !== String(contact.email || "").trim().toLowerCase()) {
    await api.crm.update(contact.id, { email });
  }

  // Reuse an existing athlete with this exact email.
  try {
    const res = await api.athletes.list({ search: email, limit: 10 });
    const list: any[] = Array.isArray(res) ? res : (res as any)?.data || [];
    const existing = list.find((a) => String(a?.email || "").toLowerCase() === email);
    if (existing?.id) {
      const anchor = await api.athletes.ensureContact(existing.id).catch(() => null);
      return {
        athleteId: existing.id,
        reused: true,
        linkedElsewhereId: anchor?.id && anchor.id !== contact.id ? anchor.id : undefined,
      };
    }
  } catch {
    /* lookup is best-effort — fall through to create */
  }

  const athlete = await api.athletes.create({ ...payload, email });
  return { athleteId: athlete.id, reused: false };
}
