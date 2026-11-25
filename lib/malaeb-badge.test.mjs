// Run: node --experimental-strip-types lib/malaeb-badge.test.mjs
import assert from "node:assert/strict";
import { malaebBadge } from "./malaeb-badge.ts";

assert.equal(malaebBadge({ externalSource: "malaeb" }).label, "On Malaeb");
assert.equal(malaebBadge({ externalSource: "malaeb-conflict" }).tone, "warn");
assert.equal(malaebBadge({ externalSource: "malaeb-cancelled" }).label, "Released on Malaeb");
assert.equal(malaebBadge({}), null);
assert.equal(malaebBadge({ externalSource: null }), null);
assert.equal(malaebBadge({ externalSource: "something-else" }), null);
console.log("malaeb-badge tests passed");
