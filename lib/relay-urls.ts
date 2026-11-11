// Pure helpers for a BioStar relay setting that may list several relays. No imports, so it runs in the
// browser and under `node --experimental-strip-types` for tests (see lib/relay-urls.test.mjs).
//
// The setting `integrations.biostar.relay_url` can hold one address or several, separated by commas
// (or spaces / new lines), e.g. "https://localhost:8444, https://10.1.101.244:8444". The CRM tries all of
// them and uses the first one that answers, so a PC with its own relay uses it and any other PC falls
// back to the shared relay.

/** Split the setting into clean addresses: scheme added if missing, trailing slashes dropped, de-duplicated, order kept. */
export function parseRelayUrls(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[\s,;]+/)) {
    let u = part.trim().replace(/\/+$/, "");
    if (!u) continue;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

export interface HealthLike {
  ok: boolean;
  /** Set when the probe itself failed (relay offline, certificate not trusted, timed out). */
  error?: string;
}

export interface RelayProbe<H extends HealthLike> {
  url: string;
  health: H;
}

export interface RelayChoice<H extends HealthLike> {
  /** The relay to use: "" when none is configured. */
  url: string;
  health: H | null;
  /** Every configured relay and how it answered, in the configured order. */
  results: RelayProbe<H>[];
}

/**
 * Probe every relay at once and pick one:
 *   1. the first (in configured order) that is healthy;
 *   2. else the first that answered but is unhealthy (e.g. it cannot log in to BioStar), because its
 *      message is more useful than a network error;
 *   3. else the first configured.
 * `probe` should not reject; if it does, that relay counts as failed via `fail`.
 */
export async function chooseRelay<H extends HealthLike>(
  urls: string[],
  probe: (url: string) => Promise<H>,
  fail: (message: string) => H,
): Promise<RelayChoice<H>> {
  if (urls.length === 0) return { url: "", health: null, results: [] };
  const results: RelayProbe<H>[] = await Promise.all(
    urls.map(async (url) => {
      try {
        return { url, health: await probe(url) };
      } catch (err) {
        return { url, health: fail(err instanceof Error && err.message ? err.message : "Relay unreachable") };
      }
    }),
  );
  const pick =
    results.find((r) => r.health.ok) ??
    results.find((r) => !r.health.error) ??
    results[0];
  return { url: pick.url, health: pick.health, results };
}
