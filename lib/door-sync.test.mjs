// Run: node --experimental-strip-types lib/door-sync.test.mjs
import assert from "node:assert/strict";
import { planDoorSync } from "./door-sync.ts";

const valid = (granted) => ({ status: "ACTIVE", valid: true, grantedDoorIds: granted });
const expired = (granted = []) => ({ status: "EXPIRED", valid: false, grantedDoorIds: granted });
const cur = (...ids) => ({ exists: ids.length > 0, groupIds: ids });
const plan = (subjectKind, membership, current) => planDoorSync({ subjectKind, membership, current });

// ── valid membership: grant-only
let p = plan("ATHLETE", valid(["1", "2"]), cur());
assert.equal(p.action, "apply"); assert.deepEqual(p.groups, ["1", "2"]); assert.deepEqual(p.added, ["1", "2"]); assert.deepEqual(p.removed, []);

p = plan("ATHLETE", valid(["1", "2"]), cur("1"));
assert.deepEqual(p, { action: "apply", groups: ["1", "2"], added: ["2"], removed: [] }, "adds only the missing group");

p = plan("ATHLETE", valid(["1"]), cur("1", "9"));
assert.deepEqual(p, { action: "none", reason: "in-sync", extras: true }, "extra manual groups are KEPT, nothing to do");

p = plan("ATHLETE", valid(["1"]), cur("9"));
assert.equal(p.action, "apply");
assert.deepEqual(p.groups.sort(), ["1", "9"], "adds the plan's group and keeps the manual one");
assert.deepEqual(p.removed, []);

p = plan("ATHLETE", valid(["1", "2"]), cur("2", "1"));
assert.deepEqual(p, { action: "none", reason: "in-sync", extras: false }, "order does not matter");

// ── valid membership but the plan grants no door groups: never strip (the Kassidy case)
p = plan("CRM_CONTACT", valid([]), cur("5"));
assert.deepEqual(p, { action: "none", reason: "plan-unconfigured", extras: false });
p = plan("CRM_CONTACT", { status: "ACTIVE", valid: true, grantedDoorIds: null }, cur("5"));
assert.deepEqual(p, { action: "none", reason: "plan-unconfigured", extras: false }, "null grants = unconfigured");
p = plan("CRM_CONTACT", { status: "ACTIVE" }, cur("5"));
assert.equal(p.reason, "plan-unconfigured", "valid inferred from ACTIVE; missing grants = unconfigured");

// ── not valid: door access is switched off
p = plan("ATHLETE", expired(), cur("1", "2"));
assert.deepEqual(p, { action: "apply", groups: [], added: [], removed: ["1", "2"] });
p = plan("ATHLETE", expired(["1"]), cur("1"));
assert.equal(p.action, "apply", "expired: removed even if the plan lists doors");
assert.deepEqual(p.removed, ["1"]);
p = plan("ATHLETE", expired(), cur());
assert.deepEqual(p, { action: "none", reason: "nothing-to-revoke", extras: false });
p = plan("ATHLETE", { status: "PENDING", valid: false, grantedDoorIds: ["1"] }, cur("1"));
assert.equal(p.action, "apply"); assert.deepEqual(p.removed, ["1"]);
p = plan("ATHLETE", { status: "ACTIVE", valid: false }, cur("1"));
assert.equal(p.action, "apply", "explicit valid:false wins over status");

// ── never touch staff or people with no membership data
for (const m of [valid(["1"]), expired(), null, undefined]) {
  p = plan("USER", m, cur("1", "2"));
  assert.deepEqual(p, { action: "none", reason: "skip", extras: false }, "staff are never touched");
}
p = plan("ATHLETE", null, cur("1"));
assert.deepEqual(p, { action: "none", reason: "skip", extras: false }, "no membership data: skip");
p = plan("FAMILY_MEMBER", undefined, cur("1"));
assert.equal(p.reason, "skip");

// ── duplicates and number-like ids are normalised
p = plan("ATHLETE", valid(["1", "1", "2"]), cur("1"));
assert.deepEqual(p.added, ["2"]);

console.log("door-sync: all assertions passed");
