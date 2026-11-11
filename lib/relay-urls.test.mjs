// Run: node --experimental-strip-types lib/relay-urls.test.mjs
import assert from "node:assert/strict";
import { parseRelayUrls, chooseRelay } from "./relay-urls.ts";

// ── parseRelayUrls
assert.deepEqual(parseRelayUrls("https://localhost:8444"), ["https://localhost:8444"]);
assert.deepEqual(parseRelayUrls(" https://localhost:8444/ , https://10.1.101.244:8444 "), ["https://localhost:8444", "https://10.1.101.244:8444"]);
assert.deepEqual(parseRelayUrls("https://a:1\nhttps://b:2;https://c:3"), ["https://a:1", "https://b:2", "https://c:3"]);
assert.deepEqual(parseRelayUrls("10.1.101.244:8444"), ["https://10.1.101.244:8444"], "adds https when no scheme");
assert.deepEqual(parseRelayUrls("http://x:1, http://x:1/"), ["http://x:1"], "keeps http, de-duplicates");
assert.deepEqual(parseRelayUrls(""), []);
assert.deepEqual(parseRelayUrls(null), []);
assert.deepEqual(parseRelayUrls(undefined), []);
assert.deepEqual(parseRelayUrls(" , ; "), []);

// ── chooseRelay
const fail = (m) => ({ ok: false, reachable: false, error: m });
const up = { ok: true, reachable: true };
const probeFrom = (table) => async (u) => {
  const v = table[u];
  if (v === "throw") throw new Error("boom");
  return v;
};
const L = "https://localhost:8444";
const S = "https://10.1.101.244:8444";

let c = await chooseRelay([], probeFrom({}), fail);
assert.equal(c.url, ""); assert.equal(c.health, null); assert.deepEqual(c.results, []);

c = await chooseRelay([L, S], probeFrom({ [L]: up, [S]: up }), fail);
assert.equal(c.url, L, "both healthy: first in configured order wins");
assert.equal(c.results.length, 2);

c = await chooseRelay([L, S], probeFrom({ [L]: fail("refused"), [S]: up }), fail);
assert.equal(c.url, S, "local down: falls back to the shared relay");
assert.equal(c.health.ok, true);
assert.equal(c.results[0].health.error, "refused", "failed probe is still reported");

c = await chooseRelay([L, S], probeFrom({ [L]: up, [S]: fail("timeout") }), fail);
assert.equal(c.url, L);

c = await chooseRelay([L, S], probeFrom({ [L]: fail("refused"), [S]: fail("timeout") }), fail);
assert.equal(c.url, L, "none answered: first configured");
assert.equal(c.health.ok, false);

// A relay that answers but cannot log in to BioStar beats one that is simply unreachable.
const loginRejected = { ok: false, reachable: false };
c = await chooseRelay([L, S], probeFrom({ [L]: fail("refused"), [S]: loginRejected }), fail);
assert.equal(c.url, S, "answered-but-unhealthy preferred over unreachable");
assert.equal(c.health.error, undefined);

// ...but a healthy relay still wins over an answered-but-unhealthy one, whatever the order.
c = await chooseRelay([L, S], probeFrom({ [L]: loginRejected, [S]: up }), fail);
assert.equal(c.url, S);

// A probe that throws counts as failed, never breaks the choice.
c = await chooseRelay([L, S], probeFrom({ [L]: "throw", [S]: up }), fail);
assert.equal(c.url, S);
assert.equal(c.results[0].health.error, "boom");

// All probes run (in parallel): both are called even when the first is healthy.
const called = [];
c = await chooseRelay([L, S], async (u) => { called.push(u); return up; }, fail);
assert.deepEqual(called.sort(), [L, S].sort());

console.log("relay-urls: all assertions passed");
