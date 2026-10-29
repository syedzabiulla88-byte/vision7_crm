// Run: node --experimental-strip-types lib/blog-seo.test.mjs
import assert from "node:assert/strict";
import { analyzeSeo, factsFromDoc, countKeyword, slugify, clip, scoreTone } from "./blog-seo.ts";

const p = (...c) => ({ type: "paragraph", content: c });
const t = (text, marks) => ({ type: "text", text, ...(marks ? { marks } : {}) });
const doc = (...c) => ({ type: "doc", content: c });

// ── factsFromDoc
const d = doc(
  { type: "heading", attrs: { level: 2 }, content: [t("Best padel courts")] },
  p(t("Padel is booming in Riyadh. "), t("Read more", [{ type: "link", attrs: { href: "/blog/other" } }])),
  p(t("see "), t("this", [{ type: "link", attrs: { href: "https://example.com/x" } }])),
  { type: "image", attrs: { src: "https://a/b.png", alt: "" } },
  { type: "image", attrs: { src: "https://a/c.png", alt: "court" } },
);
const f = factsFromDoc(d);
assert.equal(f.headings.length, 1);
assert.equal(f.headings[0].text, "Best padel courts");
assert.equal(f.links.length, 2);
assert.equal(f.links.filter((l) => l.internal).length, 1);
assert.equal(f.images.length, 2);
assert.ok(f.wordCount >= 10);
assert.deepEqual(factsFromDoc(null).headings, []);
assert.equal(factsFromDoc({ type: "doc" }).wordCount, 0);

// ── countKeyword
assert.equal(countKeyword("Padel PADEL padel", "padel"), 3);
assert.equal(countKeyword("anything", ""), 0);

// ── slugify
assert.equal(slugify("Why Padel? It's great!"), "why-padel-it-s-great");
assert.equal(slugify("  --Hello--  "), "hello");
assert.equal(slugify("مرحبا بالعالم"), "مرحبا-بالعالم");
assert.equal(slugify("a".repeat(200)).length, 80);

// ── clip
assert.equal(clip("short", 10), "short");
assert.equal(clip("abcdefghij", 5), "abcd…");

// ── analyzeSeo
const base = {
  title: "", seoTitle: "", slug: "", metaDescription: "", excerpt: "", focusKeyword: "",
  coverImageUrl: "", coverImageAlt: "", language: "en", facts: factsFromDoc(null),
};
const empty = analyzeSeo(base);
assert.ok(empty.score < 30);
assert.ok(empty.checks.some((c) => c.id === "title" && c.state === "fail"));
assert.ok(empty.checks.some((c) => c.id === "length" && c.state === "fail"));

const longText = ("padel courts in riyadh are great for players ").repeat(60);
const good = analyzeSeo({
  ...base,
  title: "Padel courts in Riyadh: a complete guide for 2026",
  slug: "padel-courts-riyadh",
  metaDescription: "Everything about padel courts in Riyadh — prices, booking tips and the best times to play for beginners and pros alike.",
  focusKeyword: "padel courts",
  coverImageUrl: "https://a/cover.png", coverImageAlt: "A padel court",
  facts: {
    text: longText, wordCount: 540,
    headings: [{ level: 2, text: "Why padel courts matter" }],
    images: [{ src: "x", alt: "ok" }],
    links: [{ href: "/memberships", internal: true }],
  },
});
assert.ok(good.score >= 90, `expected high score, got ${good.score}`);
assert.equal(scoreTone(good.score), "good");
assert.ok(good.checks.every((c) => c.state !== "fail"));

// stuffing
const stuffed = analyzeSeo({ ...base, title: "padel", focusKeyword: "padel", facts: { text: "padel ".repeat(200), wordCount: 200, headings: [], images: [], links: [] } });
assert.ok(stuffed.checks.some((c) => c.id === "kw-count" && c.state === "warn" && /stuffing/.test(c.detail)));

// excerpt fallback is flagged but not failed
const ex = analyzeSeo({ ...base, excerpt: "x".repeat(100) });
assert.ok(ex.checks.some((c) => c.id === "meta-own" && c.state === "warn"));
assert.ok(ex.checks.some((c) => c.id === "meta" && c.state === "pass"));

// alt text
const alt = analyzeSeo({ ...base, facts: { text: "a", wordCount: 1, headings: [], images: [{ src: "x", alt: "" }, { src: "y", alt: "ok" }], links: [] } });
assert.ok(alt.checks.some((c) => c.id === "alt" && /1 of 2/.test(c.detail)));

// slug keyword (hyphens vs spaces)
assert.ok(analyzeSeo({ ...base, slug: "padel-courts-riyadh", focusKeyword: "padel courts" }).checks.some((c) => c.id === "kw-slug" && c.state === "pass"));
assert.ok(analyzeSeo({ ...base, slug: "tennis", focusKeyword: "padel courts" }).checks.some((c) => c.id === "kw-slug" && c.state === "warn"));

console.log("blog-seo: all assertions passed");
