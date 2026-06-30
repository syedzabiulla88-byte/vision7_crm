"use client";

// ─── BioStar relay — browser client ──────────────────────────────────────────────
//
// Talks to the on-premises Vision7 BioStar relay DIRECTLY FROM THE BROWSER. The relay
// (see biostar-relay/index.js) is a tiny LAN HTTPS gateway: the browser calls IT
// (CORS-clean) and it forwards to the LAN-only BioStar 2 API server-side, injecting the
// BioStar session — so NO auth header is ever sent from here, and BioStar credentials
// never reach the browser.
//
//   CRM (browser) ──this client──►  RELAY (LAN)  ──session injected──►  BioStar 2
//
// Responses from `${relayUrl}/api/*` are RAW BioStar JSON (NOT the NestJS envelope).
// The relay URL is admin-configured via the settings key `integrations.biostar.relay_url`.

import { api } from "@/lib/api";

// ─── Relay URL (from app settings) ────────────────────────────────────────────────

/**
 * Read the configured relay URL from `integrations.biostar.relay_url`.
 * `api.settings.list()` returns a flat key→value record. Returns "" when unset.
 * The trailing slash is trimmed so callers can safely append `/api/...`.
 */
export async function getRelayUrl(): Promise<string> {
  try {
    const all = await api.settings.list();
    const raw = (all?.["integrations.biostar.relay_url"] || "").trim();
    return raw.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

// ─── Low-level relay fetch ────────────────────────────────────────────────────────

export interface RelayError extends Error {
  status?: number;
  /** Raw parsed BioStar body (if any) — useful to distinguish 400 "not found". */
  body?: unknown;
}

function makeError(message: string, status?: number, body?: unknown): RelayError {
  const e = new Error(message) as RelayError;
  e.status = status;
  e.body = body;
  return e;
}

/**
 * One call to the relay's BioStar proxy. NO auth header — the relay injects the
 * BioStar session. `path` is appended to `${relayUrl}` verbatim (e.g. "/api/users/5").
 * Parses JSON; on non-2xx throws a RelayError carrying the status + parsed body.
 */
async function relayFetch<T = unknown>(
  relayUrl: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  if (!relayUrl) throw makeError("BioStar relay URL is not configured");
  const method = init?.method || "GET";
  const hasBody = init?.body !== undefined && method !== "GET";
  let res: Response;
  try {
    res = await fetch(`${relayUrl}${path}`, {
      method,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(init!.body) : undefined,
    });
  } catch (err) {
    // Network/cert failure — most often the relay cert isn't trusted yet, or it's offline.
    throw makeError(
      err instanceof Error && err.message
        ? `Relay unreachable: ${err.message}. Trust the relay's certificate once per browser by opening ${relayUrl}/relay/health, then retry.`
        : "Relay unreachable",
    );
  }

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    // BioStar nests its real error under Response.message (e.g. "Invalid Parameters");
    // some relay errors use a top-level message. Surface whichever is present.
    const p = parsed as { message?: unknown; Response?: { message?: unknown; code?: unknown } } | null;
    const biostarMsg = p?.Response?.message ? String(p.Response.message) : "";
    const topMsg = p && typeof p === "object" && "message" in p ? String(p.message) : "";
    const msg = biostarMsg || topMsg || `BioStar request failed (${res.status})`;
    throw makeError(msg, res.status, parsed);
  }
  return parsed as T;
}

// ─── Health ──────────────────────────────────────────────────────────────────────

export interface RelayHealth {
  /** Relay process answered the health probe. */
  ok: boolean;
  /** Relay could log in / reach BioStar. */
  reachable: boolean;
  biostar?: string;
  /** Set when the probe itself failed (relay offline / cert untrusted). */
  error?: string;
}

/** GET `${relayUrl}/relay/health` — used by the Settings "Test connection" button. */
export async function relayHealth(relayUrl: string): Promise<RelayHealth> {
  const base = (relayUrl || "").trim().replace(/\/+$/, "");
  if (!base) return { ok: false, reachable: false, error: "No relay URL configured" };
  try {
    const res = await fetch(`${base}/relay/health`, { method: "GET" });
    if (!res.ok) return { ok: false, reachable: false, error: `Relay returned ${res.status}` };
    const json = (await res.json()) as { ok?: boolean; reachable?: boolean; biostar?: string };
    return {
      ok: Boolean(json?.ok),
      reachable: Boolean(json?.reachable),
      biostar: json?.biostar,
    };
  } catch (err) {
    return {
      ok: false,
      reachable: false,
      error:
        err instanceof Error && err.message
          ? `${err.message}. Trust the relay's certificate once per browser (open ${base}/relay/health), then retry.`
          : "Relay unreachable",
    };
  }
}

// ─── Raw BioStar shapes (only the fields we read) ─────────────────────────────────

export interface BiostarAccessGroup {
  id: string;
  name: string;
}

export interface BiostarDevice {
  id: string;
  name: string;
  /** "1" = online. */
  status?: string;
}

interface UserCollection {
  UserCollection?: { rows?: Array<{ user_id?: string }> };
}
interface CardCollection {
  CardCollection?: {
    rows?: Array<{
      id?: string;
      card_id?: string;
      display_card_id?: string;
      is_assigned?: string;
      /** Present when the card is assigned — who currently holds it. */
      user_id?: { user_id?: string; name?: string };
    }>;
  };
}

/** Default card expiry when a membership end-date isn't available. */
export const DEFAULT_EXPIRY = "2030-12-31T23:59:00.00Z";
const START_DATETIME = "2001-01-01T00:00:00.00Z";

/** Format a date/ISO string to the BioStar datetime form; falls back to the default. */
export function toBiostarExpiry(value?: string | null): string {
  if (!value) return DEFAULT_EXPIRY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return DEFAULT_EXPIRY;
  // BioStar accepts ISO 8601; normalise to the proven "…T..Z" shape.
  return d.toISOString().replace(/\.\d{3}Z$/, ".00Z");
}

// ─── Proven BioStar operations (thin fns over `${relayUrl}/api/*`) ────────────────

/** GET /api/users/{id} → 200 if exists, 400 if not. Returns true/false (never throws on 400). */
export async function findUser(relayUrl: string, userId: string): Promise<boolean> {
  try {
    await relayFetch(relayUrl, `/api/users/${encodeURIComponent(userId)}`);
    return true;
  } catch (err) {
    const e = err as RelayError;
    if (e.status === 400) return false; // BioStar's "no such user"
    throw err;
  }
}

export interface BiostarUserState {
  exists: boolean;
  name?: string;
  /** Cards currently on the user — BioStar card id (for revoke) + printed number (to show). */
  cards: { id: string; number: string }[];
  /** Access-group ids + names the user currently belongs to. */
  accessGroupIds: string[];
  accessGroupNames: string[];
  expiry?: string;
}

/**
 * GET /api/users/{id} → the member's CURRENT BioStar state (cards + access groups),
 * so the dialog can show reality and pre-select existing groups. exists:false on 400/404.
 */
export async function getBiostarUser(relayUrl: string, userId: string): Promise<BiostarUserState> {
  try {
    const res = await relayFetch<{
      User?: {
        name?: string;
        cards?: Array<{ id?: string; card_id?: string; display_card_id?: string }>;
        access_groups?: Array<{ id?: string; name?: string }>;
        expiry_datetime?: string;
      };
    }>(relayUrl, `/api/users/${encodeURIComponent(userId)}`);
    const u = res?.User || {};
    return {
      exists: true,
      name: u.name,
      cards: (u.cards || [])
        .map((c) => ({ id: String(c.id ?? ""), number: String(c.display_card_id ?? c.card_id ?? "") }))
        .filter((c) => c.number),
      accessGroupIds: (u.access_groups || []).map((g) => String(g.id ?? "")).filter(Boolean),
      accessGroupNames: (u.access_groups || []).map((g) => String(g.name ?? g.id ?? "")).filter(Boolean),
      expiry: u.expiry_datetime,
    };
  } catch (err) {
    const e = err as RelayError;
    if (e.status === 400 || e.status === 404) {
      return { exists: false, cards: [], accessGroupIds: [], accessGroupNames: [] };
    }
    throw err;
  }
}

/** POST /api/users — create a BioStar user. Returns the created user_id. */
export async function createUser(
  relayUrl: string,
  args: { name: string; userId: string; expiry?: string },
): Promise<string> {
  const body = {
    User: {
      name: args.name,
      user_id: args.userId,
      user_group_id: { id: "1" },
      start_datetime: START_DATETIME,
      expiry_datetime: toBiostarExpiry(args.expiry),
    },
  };
  const res = await relayFetch<UserCollection>(relayUrl, `/api/users`, { method: "POST", body });
  return res?.UserCollection?.rows?.[0]?.user_id || args.userId;
}

/**
 * PUT /api/users/{id} — refresh an existing BioStar user's name + validity window so
 * BioStar stays in sync with the CRM (a renamed member, or a renewed membership whose
 * expiry moved). A partial PUT — only the fields we manage; cards/groups are untouched.
 */
export async function updateUser(
  relayUrl: string,
  args: { name: string; userId: string; expiry?: string },
): Promise<void> {
  const body = {
    User: {
      name: args.name,
      start_datetime: START_DATETIME,
      expiry_datetime: toBiostarExpiry(args.expiry),
    },
  };
  await relayFetch(relayUrl, `/api/users/${encodeURIComponent(args.userId)}`, { method: "PUT", body });
}

/**
 * POST /api/cards — enroll a CSN card by its printed number.
 * Returns the BioStar card id (CardCollection.rows[0].id) needed to assign it.
 */
export async function enrollCard(
  relayUrl: string,
  cardNumber: string,
): Promise<{ biostarCardId: string; cardId?: string; displayCardId?: string; reused?: boolean }> {
  const body = { Card: { card_id: cardNumber, card_type: { id: "0" } } };
  try {
    const res = await relayFetch<CardCollection>(relayUrl, `/api/cards`, { method: "POST", body });
    const row = res?.CardCollection?.rows?.[0];
    if (!row?.id) throw makeError("Card enrolled but BioStar returned no card id", undefined, res);
    return { biostarCardId: row.id, cardId: row.card_id, displayCardId: row.display_card_id };
  } catch (err) {
    // BioStar answers a duplicate card_id with 400 "not defined" (code 65744). The card
    // already exists — reuse its record instead of failing, so re-pushing the same card
    // (or moving one between members) just works.
    if ((err as RelayError).status === 400) {
      const existing = await findCardByNumber(relayUrl, cardNumber);
      if (existing) return { ...existing, reused: true };
    }
    throw err;
  }
}

/**
 * GET /api/cards — find an already-enrolled card by its printed number. BioStar has no
 * server-side card filter (a ?card_id query is ignored), so we scan the list. Returns the
 * BioStar card id or null.
 */
export async function findCardByNumber(
  relayUrl: string,
  cardNumber: string,
): Promise<{
  biostarCardId: string;
  cardId?: string;
  displayCardId?: string;
  /** Set when the card is currently assigned to a user (BioStar refuses to re-assign it). */
  holderUserId?: string;
  holderName?: string;
} | null> {
  const res = await relayFetch<CardCollection>(relayUrl, `/api/cards?limit=1000`);
  const rows = res?.CardCollection?.rows ?? [];
  const n = String(cardNumber);
  const row = rows.find((r) => String(r.card_id) === n || String(r.display_card_id) === n);
  if (!row?.id) return null;
  return {
    biostarCardId: row.id,
    cardId: row.card_id,
    displayCardId: row.display_card_id,
    holderUserId: row.user_id?.user_id || undefined,
    holderName: row.user_id?.name || undefined,
  };
}

/** PUT /api/users/{id} — assign an enrolled card (by BioStar card id) to the user. */
export async function assignCardToUser(
  relayUrl: string,
  userId: string,
  biostarCardId: string,
): Promise<void> {
  const body = { User: { cards: [{ id: biostarCardId }] } };
  await relayFetch(relayUrl, `/api/users/${encodeURIComponent(userId)}`, { method: "PUT", body });
}

/** PUT /api/users/{id} — grant door access groups to the user. */
export async function grantAccessGroups(
  relayUrl: string,
  userId: string,
  accessGroupIds: string[],
): Promise<void> {
  const body = { User: { access_groups: accessGroupIds.map((id) => ({ id })) } };
  await relayFetch(relayUrl, `/api/users/${encodeURIComponent(userId)}`, { method: "PUT", body });
}

/** PUT /api/users/{id} with cards:[] — remove the card(s) from the user. */
export async function revokeUserCards(relayUrl: string, userId: string): Promise<void> {
  const body = { User: { cards: [] } };
  await relayFetch(relayUrl, `/api/users/${encodeURIComponent(userId)}`, { method: "PUT", body });
}

/**
 * PUT /api/users/{id} — remove ONE card from the user, leaving the rest.
 * PUT cards is REPLACE-semantics (verified), so we read the current cards and write back
 * all of them EXCEPT the one being revoked (empty array when it was the last card).
 */
export async function revokeUserCard(
  relayUrl: string,
  userId: string,
  biostarCardId: string,
): Promise<void> {
  const u = await getBiostarUser(relayUrl, userId);
  const remaining = u.cards.filter((c) => c.id !== biostarCardId).map((c) => ({ id: c.id }));
  const body = { User: { cards: remaining } };
  await relayFetch(relayUrl, `/api/users/${encodeURIComponent(userId)}`, { method: "PUT", body });
}

/** GET /api/access_groups → list of door-access groups. */
export async function listAccessGroups(relayUrl: string): Promise<BiostarAccessGroup[]> {
  const res = await relayFetch<{ AccessGroupCollection?: { rows?: BiostarAccessGroup[] } }>(
    relayUrl,
    `/api/access_groups`,
  );
  return res?.AccessGroupCollection?.rows ?? [];
}

/** GET /api/devices → readers/devices (status "1" = online). */
export async function listDevices(relayUrl: string): Promise<BiostarDevice[]> {
  const res = await relayFetch<{ DeviceCollection?: { rows?: BiostarDevice[] } }>(
    relayUrl,
    `/api/devices`,
  );
  return res?.DeviceCollection?.rows ?? [];
}

/**
 * POST /api/devices/{id}/scan_card — read a card tapped on a reader. Can time out
 * if no card is presented; callers should handle the rejection gracefully.
 */
export async function scanCard(
  relayUrl: string,
  deviceId: string,
): Promise<{ cardId?: string; cardType?: unknown; raw?: unknown }> {
  const res = await relayFetch<Record<string, any>>(
    relayUrl,
    `/api/devices/${encodeURIComponent(deviceId)}/scan_card`,
    { method: "POST" },
  );
  // BioStar nests the scanned card differently across versions/readers:
  //   { Card: { card_id, display_card_id, card_type } }   (most common)
  //   { CSNCardCollection: { rows: [{ card_id, … }] } }
  //   { CardCollection:    { rows: [{ card_id, … }] } }
  //   { card_id }                                         (rare / top-level)
  const card =
    res?.Card ??
    res?.card ??
    res?.CSNCardCollection?.rows?.[0] ??
    res?.CardCollection?.rows?.[0] ??
    res;
  const raw = card?.card_id ?? card?.display_card_id;
  return { cardId: raw != null && raw !== "" ? String(raw) : undefined, cardType: card?.card_type, raw: res };
}

// ─── Orchestrated assign (user → card → assign → access groups) ───────────────────

export interface StepResult {
  label: string;
  ok: boolean;
  message: string;
}

export interface AssignArgs {
  relayUrl: string;
  name: string;
  userId: string;
  /** A printed card number to enroll + assign. Blank/omitted → cards left unchanged. */
  cardNumber?: string;
  /** The DESIRED final set of access-group ids — BioStar is set to exactly this. */
  accessGroupIds: string[];
  /** When true (default) set BioStar groups to exactly accessGroupIds; false = leave untouched. */
  applyGroups?: boolean;
  /** Membership validUntil (any date string) or undefined → DEFAULT_EXPIRY. */
  expiry?: string | null;
}

/**
 * Sync a member into BioStar, returning a per-step result array so the UI can show
 * progress and pinpoint which step failed. Adaptive:
 *   1) User      — create if missing, else update name + expiry (always).
 *   2) Card      — enroll + assign, ONLY when a card number is given (else skipped).
 *   3) Groups    — when applyGroups (default), set BioStar's groups to EXACTLY
 *                  accessGroupIds (adds + removes; empty clears them).
 * Stops at the first hard failure of a step a later one depends on.
 */
export async function assignCardAndAccess(args: AssignArgs): Promise<StepResult[]> {
  const { relayUrl, name, userId, accessGroupIds, expiry } = args;
  const card = (args.cardNumber || "").trim();
  const applyGroups = args.applyGroups !== false;
  const steps: StepResult[] = [];

  // 1) Ensure the BioStar user exists (create) or refresh it (update name + expiry).
  try {
    const exists = await findUser(relayUrl, userId);
    if (exists) {
      await updateUser(relayUrl, { name, userId, expiry: expiry || undefined });
      steps.push({ label: "User", ok: true, message: `Updated ${name} (#${userId})` });
    } else {
      await createUser(relayUrl, { name, userId, expiry: expiry || undefined });
      steps.push({ label: "User", ok: true, message: `Created ${name} (#${userId})` });
    }
  } catch (err) {
    steps.push({ label: "User", ok: false, message: errMsg(err) });
    return steps;
  }

  // 2) Card — only when a number was given. Enroll then assign.
  if (card) {
    let biostarCardId: string;
    try {
      const enrolled = await enrollCard(relayUrl, card);
      biostarCardId = enrolled.biostarCardId;
      const shown = enrolled.displayCardId || enrolled.cardId || card;
      steps.push({
        label: "Enroll card",
        ok: true,
        message: enrolled.reused ? `Card ${shown} already in BioStar — reusing` : `Card ${shown} enrolled`,
      });
    } catch (err) {
      steps.push({ label: "Enroll card", ok: false, message: errMsg(err) });
      return steps;
    }
    try {
      await assignCardToUser(relayUrl, userId, biostarCardId);
      steps.push({ label: "Assign card", ok: true, message: "Card assigned to user" });
    } catch (err) {
      steps.push({ label: "Assign card", ok: false, message: errMsg(err) });
      return steps;
    }
  }

  // 3) Access groups — set BioStar to exactly the chosen set (add + remove).
  if (applyGroups) {
    try {
      await grantAccessGroups(relayUrl, userId, accessGroupIds);
      steps.push({
        label: "Access groups",
        ok: true,
        message:
          accessGroupIds.length === 0
            ? "Cleared all door groups"
            : `Set ${accessGroupIds.length} door group${accessGroupIds.length === 1 ? "" : "s"}`,
      });
    } catch (err) {
      steps.push({ label: "Access groups", ok: false, message: errMsg(err) });
    }
  }

  return steps;
}

function errMsg(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Failed";
}
