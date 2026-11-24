// Run: node --experimental-strip-types lib/current-membership.test.mjs
import assert from "node:assert/strict";
import { orderMemberships, isCurrent, displayStatus } from "./current-membership.ts";

const now = new Date("2026-11-16T10:00:00Z");
const renewal = { id: "renewal", status: "ACTIVE", startDate: "2027-04-09" };
const frozen = { id: "frozen", status: "FROZEN", startDate: "2026-08-16" };
const expired = { id: "expired", status: "EXPIRED", startDate: "2025-01-01" };
const active = { id: "active", status: "ACTIVE", startDate: "2026-01-01" };

// Sabina: backend sends [renewal(ACTIVE, future), frozen] -> frozen current plan first
assert.deepEqual(orderMemberships([renewal, frozen], now).map((m) => m.id), ["frozen", "renewal"]);
// A future renewal still beats an expired plan (nothing current)
assert.deepEqual(orderMemberships([renewal, expired], now).map((m) => m.id), ["renewal", "expired"]);
// Current ACTIVE stays ahead of its queued renewal
assert.deepEqual(orderMemberships([renewal, active], now).map((m) => m.id), ["active", "renewal"]);
// Already-correct order and ties keep the backend order (stable)
assert.deepEqual(orderMemberships([active, frozen], now).map((m) => m.id), ["active", "frozen"]);
assert.deepEqual(orderMemberships([frozen, active], now).map((m) => m.id), ["frozen", "active"]);
// Input is not mutated; empty is fine
const input = [renewal, frozen];
orderMemberships(input, now);
assert.equal(input[0].id, "renewal");
assert.deepEqual(orderMemberships([], now), []);
assert.equal(isCurrent({ status: "ACTIVE" }, now), true, "no start date counts as current");
assert.equal(isCurrent({ status: "PENDING", startDate: "2026-01-01" }, now), false);
// Badge: ACTIVE but not started yet shows PENDING; everything else as stored
assert.equal(displayStatus(renewal, now), "PENDING");
assert.equal(displayStatus(active, now), "ACTIVE");
assert.equal(displayStatus(frozen, now), "FROZEN");
assert.equal(displayStatus({ status: "ACTIVE" }, now), "ACTIVE");
assert.equal(displayStatus({ status: "EXPIRED", startDate: "2027-01-01" }, now), "EXPIRED");
console.log("current-membership tests passed");
