// Pure SEO analysis for the blog editor. No imports, so it runs unchanged in the browser and under
// `node --experimental-strip-types` for tests (see lib/blog-seo.test.mjs).

export interface DocFacts {
  text: string;
  wordCount: number;
  headings: { level: number; text: string }[];
  images: { src: string; alt: string }[];
  links: { href: string; internal: boolean }[];
}

interface PMNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
}

const isInternal = (href: string) => {
  if (href.startsWith("/") || href.startsWith("#")) return true;
  try {
    const h = new URL(href).hostname.toLowerCase();
    return h === "vision7.sa" || h === "www.vision7.sa";
  } catch {
    return false;
  }
};

/** Walk the editor document and collect what the checks need. */
export function factsFromDoc(doc: unknown): DocFacts {
  const out: DocFacts = { text: "", wordCount: 0, headings: [], images: [], links: [] };
  const parts: string[] = [];
  const textOf = (n: PMNode): string =>
    typeof n.text === "string" ? n.text : (n.content ?? []).map(textOf).join("");

  const walk = (n: PMNode) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "text" && typeof n.text === "string") {
      parts.push(n.text);
      for (const m of n.marks ?? []) {
        if (m?.type === "link" && typeof m.attrs?.href === "string") {
          out.links.push({ href: m.attrs.href, internal: isInternal(m.attrs.href) });
        }
      }
    } else if (n.type === "heading") {
      out.headings.push({ level: Number(n.attrs?.level) || 2, text: textOf(n).trim() });
    } else if (n.type === "image") {
      out.images.push({ src: String(n.attrs?.src ?? ""), alt: String(n.attrs?.alt ?? "") });
    }
    if (n.type === "paragraph" || n.type === "heading" || n.type === "listItem") parts.push("\n");
    for (const c of n.content ?? []) walk(c);
  };
  walk(doc as PMNode);

  out.text = parts.join(" ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
  out.wordCount = out.text ? out.text.split(/\s+/u).filter(Boolean).length : 0;
  return out;
}

export interface SeoInput {
  title: string;
  seoTitle: string;
  slug: string;
  metaDescription: string;
  excerpt: string;
  focusKeyword: string;
  coverImageUrl: string;
  coverImageAlt: string;
  language: "en" | "ar";
  facts: DocFacts;
}

export type CheckState = "pass" | "warn" | "fail";
export interface SeoCheck {
  id: string;
  state: CheckState;
  label: string;
  /** What to do, or what was found. */
  detail: string;
}

export interface SeoReport {
  score: number;
  checks: SeoCheck[];
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase().trim();

/** How many times `keyword` appears in `text` (whole-text, case-insensitive). */
export function countKeyword(text: string, keyword: string): number {
  const k = norm(keyword);
  if (!k) return 0;
  const t = norm(text);
  let n = 0;
  for (let i = t.indexOf(k); i !== -1; i = t.indexOf(k, i + k.length)) n++;
  return n;
}

const includesKw = (text: string, kw: string) => !!kw && norm(text).includes(norm(kw));

/** Slug words (hyphen-separated) for matching a keyword like "padel courts" against "padel-courts-riyadh". */
const slugHasKeyword = (slug: string, kw: string) =>
  !!kw && norm(slug).replace(/-/g, " ").includes(norm(kw).replace(/[\s-]+/g, " "));

export const TITLE_RANGE = { min: 30, max: 60 } as const;
export const META_RANGE = { min: 70, max: 160 } as const;
export const MIN_WORDS = 300;

export function analyzeSeo(i: SeoInput): SeoReport {
  const checks: SeoCheck[] = [];
  const add = (id: string, state: CheckState, label: string, detail: string) =>
    checks.push({ id, state, label, detail });

  const f = i.facts;
  const kw = i.focusKeyword.trim();
  const shownTitle = (i.seoTitle || i.title).trim();
  const meta = (i.metaDescription || i.excerpt).trim();

  // Title
  if (!shownTitle) add("title", "fail", "Title", "Add a title.");
  else if (shownTitle.length < TITLE_RANGE.min)
    add("title", "warn", "Title length", `${shownTitle.length} characters — aim for ${TITLE_RANGE.min}–${TITLE_RANGE.max}.`);
  else if (shownTitle.length > TITLE_RANGE.max)
    add("title", "warn", "Title length", `${shownTitle.length} characters — Google cuts it off after about ${TITLE_RANGE.max}.`);
  else add("title", "pass", "Title length", `${shownTitle.length} characters.`);

  // Meta description
  if (!meta) add("meta", "fail", "Meta description", "Add one — it is the text search results show under your title.");
  else if (meta.length < META_RANGE.min)
    add("meta", "warn", "Meta description length", `${meta.length} characters — aim for ${META_RANGE.min}–${META_RANGE.max}.`);
  else if (meta.length > META_RANGE.max)
    add("meta", "warn", "Meta description length", `${meta.length} characters — it will be cut off after about ${META_RANGE.max}.`);
  else add("meta", "pass", "Meta description length", `${meta.length} characters.`);
  if (!i.metaDescription.trim() && i.excerpt.trim())
    add("meta-own", "warn", "Dedicated meta description", "Using the excerpt. Write a description made for search results.");

  // Slug
  if (!i.slug.trim()) add("slug", "fail", "URL slug", "Add a URL slug.");
  else if (i.slug.length > 75) add("slug", "warn", "URL slug", "Long — shorter addresses are easier to read and share.");
  else add("slug", "pass", "URL slug", `/blog/${i.slug}`);

  // Content length
  if (f.wordCount === 0) add("length", "fail", "Content", "The post is empty.");
  else if (f.wordCount < MIN_WORDS)
    add("length", "warn", "Content length", `${f.wordCount} words — posts under ${MIN_WORDS} words rarely rank. Aim for 600+.`);
  else add("length", "pass", "Content length", `${f.wordCount} words.`);

  // Structure
  const h2 = f.headings.filter((h) => h.level === 2).length;
  if (f.wordCount >= MIN_WORDS && f.headings.length === 0)
    add("headings", "warn", "Subheadings", "Break the post up with H2/H3 headings.");
  else if (f.headings.length > 0) add("headings", "pass", "Subheadings", `${f.headings.length} heading${f.headings.length === 1 ? "" : "s"}.`);
  if (f.headings.length > 0 && h2 === 0)
    add("h2", "warn", "Heading order", "Use H2 for the main sections (the title is already the H1).");

  // Images
  if (!i.coverImageUrl.trim()) add("cover", "warn", "Cover image", "Add a cover image — it is the social-share picture.");
  else if (!i.coverImageAlt.trim()) add("cover-alt", "warn", "Cover image description", "Describe the cover image for screen readers and image search.");
  else add("cover", "pass", "Cover image", "Added, with a description.");
  const missingAlt = f.images.filter((m) => !m.alt.trim()).length;
  if (f.images.length > 0) {
    if (missingAlt > 0) add("alt", "warn", "Image descriptions", `${missingAlt} of ${f.images.length} image${f.images.length === 1 ? "" : "s"} missing alt text.`);
    else add("alt", "pass", "Image descriptions", "Every image has alt text.");
  }

  // Links
  const internal = f.links.filter((l) => l.internal).length;
  if (f.wordCount >= MIN_WORDS) {
    if (internal === 0) add("internal", "warn", "Internal links", "Link to at least one other page on vision7.sa.");
    else add("internal", "pass", "Internal links", `${internal} link${internal === 1 ? "" : "s"} to the site.`);
  }

  // Focus keyword
  if (!kw) {
    add("kw", "warn", "Focus keyword", "Set the phrase you want this post to rank for.");
  } else {
    add("kw", "pass", "Focus keyword", `“${kw}”`);
    add("kw-title", includesKw(shownTitle, kw) ? "pass" : "warn", "Keyword in title", includesKw(shownTitle, kw) ? "Found." : "Put the keyword in the title, ideally near the start.");
    add("kw-meta", includesKw(meta, kw) ? "pass" : "warn", "Keyword in meta description", includesKw(meta, kw) ? "Found." : "Mention the keyword in the description.");
    add("kw-slug", slugHasKeyword(i.slug, kw) ? "pass" : "warn", "Keyword in URL", slugHasKeyword(i.slug, kw) ? "Found." : "Use the keyword in the slug.");
    const firstPara = f.text.split("\n").find((p) => p.trim()) ?? "";
    add("kw-intro", includesKw(firstPara, kw) ? "pass" : "warn", "Keyword in first paragraph", includesKw(firstPara, kw) ? "Found." : "Use the keyword in your opening paragraph.");
    if (f.headings.length > 0) {
      const inHeading = f.headings.some((h) => includesKw(h.text, kw));
      add("kw-heading", inHeading ? "pass" : "warn", "Keyword in a subheading", inHeading ? "Found." : "Use it in at least one subheading.");
    }
    if (f.wordCount >= 100) {
      const n = countKeyword(f.text, kw);
      const density = (n * (kw.split(/\s+/).length)) / f.wordCount;
      if (n === 0) add("kw-count", "warn", "Keyword in the text", "The keyword never appears in the body.");
      else if (density > 0.03) add("kw-count", "warn", "Keyword density", `Used ${n} times (${(density * 100).toFixed(1)}%) — that reads as stuffing. Keep it under 3%.`);
      else add("kw-count", "pass", "Keyword in the text", `Used ${n} time${n === 1 ? "" : "s"}.`);
    }
  }

  const points = { pass: 1, warn: 0.3, fail: 0 } as const;
  const score = Math.round((checks.reduce((a, c) => a + points[c.state], 0) / Math.max(1, checks.length)) * 100);
  return { score, checks };
}

export const scoreTone = (score: number): "good" | "ok" | "poor" => (score >= 80 ? "good" : score >= 55 ? "ok" : "poor");

/** Lowercase, hyphenated, Arabic letters kept — same shape the server accepts. */
export function slugify(input: string, max = 80): string {
  return String(input ?? "")
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Truncate for the search-result preview the way Google does (roughly). */
export function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}
