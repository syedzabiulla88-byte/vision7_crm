// Run: node --experimental-strip-types lib/date-range.test.mjs
import assert from "node:assert/strict";
import { endDateError } from "./date-range.ts";

assert.equal(endDateError("2026-08-16", "2027-02-12"), null);
assert.equal(endDateError("2026-08-16", "2026-08-17"), null, "one day later is fine");
assert.match(endDateError("2026-08-16", "2026-04-08"), /after the start date/, "Sabina's case");
assert.match(endDateError("2026-08-16", "2026-08-16"), /after the start date/, "same day rejected");
assert.equal(endDateError("2026-08-16", ""), null, "open-ended is fine");
assert.equal(endDateError("", "2026-04-08"), null, "no start yet");
assert.equal(endDateError(null, undefined), null);
console.log("date-range tests passed");
