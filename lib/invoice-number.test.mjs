// Run: node --experimental-strip-types lib/invoice-number.test.mjs
import assert from "node:assert/strict";
import { shortGap } from "./invoice-number.ts";

assert.equal(shortGap("INV-2026-0502"), "502");
assert.equal(shortGap("INV-2026-0059"), "59");
console.log("invoice-number tests passed");
