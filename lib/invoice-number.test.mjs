// Run: node --experimental-strip-types lib/invoice-number.test.mjs
import assert from "node:assert/strict";
import { isIssuedInvoice, shortGap } from "./invoice-number.ts";

assert.equal(isIssuedInvoice({ status: "DRAFT", amountPaid: 0 }), false);
assert.equal(isIssuedInvoice({ status: "draft" }), false);
assert.equal(isIssuedInvoice({ status: "PAID" }), true);
assert.equal(isIssuedInvoice({ status: "SENT" }), true);
assert.equal(isIssuedInvoice({ status: "DRAFT", amountPaid: 10 }), true);
assert.equal(shortGap("INV-2026-0502"), "502");
console.log("invoice-number tests passed");
