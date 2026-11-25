// Run: node --experimental-strip-types lib/access-gate.test.mjs
import assert from "node:assert/strict";
import { accessBlockReason } from "./access-gate.ts";

const m = (status, valid) => ({ membership: { status, ...(valid === undefined ? {} : { valid }) } });

// Valid memberships are allowed
assert.equal(accessBlockReason("ATHLETE", m("ACTIVE", true)), null);
assert.equal(accessBlockReason("CRM_CONTACT", m("ACTIVE")), null, "valid inferred from ACTIVE");
assert.equal(accessBlockReason("FAMILY_MEMBER", m("active")), null, "status is case-insensitive");

// Expired is blocked, with the expiry wording
assert.match(accessBlockReason("ATHLETE", m("EXPIRED", false)), /has expired/);
assert.match(accessBlockReason("ATHLETE", m("EXPIRED")), /has expired/);
assert.match(accessBlockReason("CRM_CONTACT", m("expired")), /has expired/);

// Explicit valid:false wins over an ACTIVE-looking status
assert.notEqual(accessBlockReason("ATHLETE", m("ACTIVE", false)), null);

// No membership at all
assert.match(accessBlockReason("ATHLETE", { membership: null }), /No valid membership/);
assert.match(accessBlockReason("ATHLETE", {}), /No valid membership/);
assert.match(accessBlockReason("ATHLETE", m("NONE")), /No valid membership/);
assert.match(accessBlockReason("ATHLETE", m(null)), /No valid membership/);

// Other non-active states name the state
assert.match(accessBlockReason("ATHLETE", m("PENDING", false)), /is pending/);
assert.match(accessBlockReason("ATHLETE", m("CANCELLED", false)), /is cancelled/);
assert.match(accessBlockReason("ATHLETE", m("SUSPENDED", false)), /is suspended/);

// Queued membership (ACTIVE, starts later): say when, instead of "activate it"
const now = new Date("2026-11-24T10:00:00Z");
const queued = { membership: { status: "PENDING", valid: false }, gate: { memberships: [{ status: "ACTIVE", startDate: "2026-11-29T00:00:00.000Z" }] } };
assert.match(accessBlockReason("ATHLETE", queued, now), /starts on 29 Nov 2026/);
// A started ACTIVE one does not trigger the start-date message
const started = { membership: { status: "PENDING", valid: false }, gate: { memberships: [{ status: "ACTIVE", startDate: "2026-11-01T00:00:00.000Z" }] } };
assert.match(accessBlockReason("ATHLETE", started, now), /is pending/);

// Staff are never blocked, whatever the detail says
assert.equal(accessBlockReason("USER", null), null);
assert.equal(accessBlockReason("USER", { membership: null }), null);
assert.equal(accessBlockReason("USER", m("EXPIRED", false)), null);

// Not loaded yet: closed, with a "checking" message (so buttons don't flash enabled)
assert.match(accessBlockReason("ATHLETE", null), /Checking the membership/);
assert.match(accessBlockReason("ATHLETE", undefined), /Checking the membership/);

console.log("access-gate: all assertions passed");
