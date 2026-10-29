"use client";

import { use, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api, uploadFile, type BlogInput, type BlogPost, type BlogRow, type BlogStatus } from "@/lib/api";
import { analyzeSeo, factsFromDoc, slugify, META_RANGE, TITLE_RANGE } from "@/lib/blog-seo";
import { usePermissions } from "@/components/hooks/use-permissions";
import { RichTextEditor } from "@/components/blog/rich-text-editor";
import { BlogStatusBadge } from "@/components/blog/status-badge";
import { CharCount, SeoChecklist, SerpPreview } from "@/components/blog/seo-panel";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Upload, Warning } from "@/lib/icons";

interface Form {
  title: string;
  slug: string;
  language: "en" | "ar";
  excerpt: string;
  metaDescription: string;
  seoTitle: string;
  focusKeyword: string;
  canonicalUrl: string;
  ogImageUrl: string;
  coverImageUrl: string;
  coverImageAlt: string;
  category: string;
  tags: string;
  noindex: boolean;
  translationOfId: string;
}

const BLANK: Form = {
  title: "", slug: "", language: "en", excerpt: "", metaDescription: "", seoTitle: "", focusKeyword: "",
  canonicalUrl: "", ogImageUrl: "", coverImageUrl: "", coverImageAlt: "", category: "", tags: "", noindex: false,
  translationOfId: "",
};

const formFrom = (p: BlogPost): Form => ({
  title: p.title, slug: p.slug, language: p.language, excerpt: p.excerpt ?? "", metaDescription: p.metaDescription ?? "",
  seoTitle: p.seoTitle ?? "", focusKeyword: p.focusKeyword ?? "", canonicalUrl: p.canonicalUrl ?? "",
  ogImageUrl: p.ogImageUrl ?? "", coverImageUrl: p.coverImageUrl ?? "", coverImageAlt: p.coverImageAlt ?? "",
  category: p.category ?? "", tags: (p.tags ?? []).join(", "), noindex: !!p.noindex, translationOfId: p.translationOfId ?? "",
});

const orNull = (s: string) => (s.trim() ? s.trim() : null);

const payloadFrom = (f: Form): BlogInput => ({
  title: f.title.trim(),
  slug: f.slug.trim() || undefined,
  language: f.language,
  excerpt: orNull(f.excerpt),
  metaDescription: orNull(f.metaDescription),
  seoTitle: orNull(f.seoTitle),
  focusKeyword: orNull(f.focusKeyword),
  canonicalUrl: orNull(f.canonicalUrl),
  ogImageUrl: orNull(f.ogImageUrl),
  coverImageUrl: orNull(f.coverImageUrl),
  coverImageAlt: orNull(f.coverImageAlt),
  category: orNull(f.category),
  tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
  noindex: f.noindex,
  translationOfId: f.translationOfId || null,
});

/** Value of a <input type="datetime-local"> for a Date, in local time. */
const LANGUAGE_ITEMS = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية (Arabic, right-to-left)" },
];

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type StaffOpt = { id: string; name?: string | null; email?: string | null };

export default function BlogEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = id === "new";
  const router = useRouter();
  const { can } = usePermissions();

  const [loading, setLoading] = useState(!isNew);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [doc, setDoc] = useState<unknown>(null);
  const [docDirty, setDocDirty] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [assignee, setAssignee] = useState<string>("");
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [translationOptions, setTranslationOptions] = useState<BlogRow[]>([]);
  const [coverUploading, setCoverUploading] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);

  // base-ui looks labels up from `items`, so the closed trigger shows a name rather than the raw value.
  const staffItems = useMemo(
    () => [{ value: "none", label: "Unassigned" }, ...staff.map((u) => ({ value: u.id, label: u.name || u.email || u.id }))],
    [staff],
  );
  const translationItems = useMemo(
    () => [{ value: "none", label: "Not a translation" }, ...translationOptions.map((p) => ({ value: p.id, label: p.title }))],
    [translationOptions],
  );

  const canCreate = can("blogs:create");
  const canAssignPerm = can("blogs:assign");
  const access = post?.access;
  const readOnly = isNew ? !canCreate : !access?.canEdit;
  const dir = form.language === "ar" ? "rtl" : "ltr";

  // ─── load ────────────────────────────────────────────────────────────
  const loadPost = useCallback(async () => {
    const p = await api.blog.get(id);
    setPost(p);
    setForm(formFrom(p));
    setDoc(p.contentJson ?? null);
    setAssignee(p.assignedToId ?? "");
    setDocDirty(false);
    setDirty(false);
    return p;
  }, [id]);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        await loadPost();
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Could not load the post");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, loadPost]);

  // Pickers: non-fatal when they fail.
  useEffect(() => {
    api.blog.meta().then((m) => setCategories(m.categories)).catch(() => undefined);
    if (canAssignPerm) {
      api.users.directory().then((u) => setStaff(Array.isArray(u) ? u : [])).catch(() => undefined);
    }
  }, [canAssignPerm]);

  const other = form.language === "en" ? "ar" : "en";
  useEffect(() => {
    api.blog
      .list({ language: other, limit: 100 })
      .then((r) => setTranslationOptions(r.data.filter((p) => p.id !== id)))
      .catch(() => setTranslationOptions([]));
  }, [other, id]);

  // ─── editing ─────────────────────────────────────────────────────────
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const onTitle = (title: string) => {
    setForm((f) => ({ ...f, title, ...(slugTouched ? {} : { slug: slugify(title) }) }));
    setDirty(true);
  };

  const onDoc = useCallback((d: unknown) => {
    setDoc(d);
    setDocDirty(true);
    setDirty(true);
  }, []);

  const deferredDoc = useDeferredValue(doc);
  const facts = useMemo(() => factsFromDoc(deferredDoc), [deferredDoc]);
  const report = useMemo(
    () =>
      analyzeSeo({
        title: form.title, seoTitle: form.seoTitle, slug: form.slug, metaDescription: form.metaDescription,
        excerpt: form.excerpt, focusKeyword: form.focusKeyword, coverImageUrl: form.coverImageUrl,
        coverImageAlt: form.coverImageAlt, language: form.language, facts,
      }),
    [form, facts],
  );

  // Leave-page warning while there are unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ─── save ────────────────────────────────────────────────────────────
  const save = useCallback(async (): Promise<boolean> => {
    if (readOnly || saving) return false;
    if (form.title.trim().length < 3) {
      toast.error("Add a title (at least 3 characters).");
      return false;
    }
    setSaving(true);
    try {
      const body: BlogInput = { ...payloadFrom(form), ...(docDirty || isNew ? { contentJson: doc } : {}) };
      if (isNew) {
        if (canAssignPerm && assignee) body.assignedToId = assignee;
        const created = await api.blog.create(body);
        setDirty(false);
        toast.success("Draft saved");
        router.replace(`/blog/${created.id}`);
        return true;
      }
      const row = await api.blog.update(id, body);
      setForm((f) => ({ ...f, slug: row.slug }));
      setDocDirty(false);
      setDirty(false);
      toast.success("Saved");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [readOnly, saving, form, docDirty, doc, isNew, id, router, canAssignPerm, assignee]);

  // Ctrl/Cmd+S
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ─── workflow ────────────────────────────────────────────────────────
  const changeStatus = async (to: BlogStatus, extra?: { scheduledAt?: string; reviewNote?: string }) => {
    if (isNew || busy) return;
    setBusy(true);
    try {
      if (dirty && !readOnly) {
        const ok = await save();
        if (!ok) return;
      }
      await api.blog.setStatus(id, { status: to, ...extra });
      await loadPost();
      toast.success(
        to === "PUBLISHED" ? "Published to vision7.sa"
        : to === "SCHEDULED" ? "Scheduled"
        : to === "IN_REVIEW" ? "Sent for review"
        : to === "ARCHIVED" ? "Archived"
        : "Moved to draft",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the status");
    } finally {
      setBusy(false);
    }
  };

  const changeAssignee = async (value: string) => {
    setAssignee(value);
    if (isNew) return;
    try {
      await api.blog.assign(id, value || null);
      toast.success(value ? "Assigned" : "Unassigned");
      await loadPost();
    } catch (err) {
      setAssignee(post?.assignedToId ?? "");
      toast.error(err instanceof Error ? err.message : "Could not assign the post");
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.blog.remove(id);
      setDirty(false);
      toast.success("Post deleted");
      router.replace("/blog");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the post");
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const uploadCover = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Pick an image file.");
    setCoverUploading(true);
    try {
      const { url } = await uploadFile(file, { category: "image", folder: "blog" });
      set("coverImageUrl", url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setCoverUploading(false);
      if (coverRef.current) coverRef.current.value = "";
    }
  };

  // ─── render ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[32rem] w-full" />
      </div>
    );
  }
  if (!isNew && !post) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" render={<Link href="/blog" />}><ArrowLeft className="h-4 w-4" /> Back to posts</Button>
        <p className="text-muted-foreground">This post could not be loaded. It may have been deleted.</p>
      </div>
    );
  }

  const status = post?.status;
  const canSubmit = !!access?.canSubmit;
  const canPublish = !!access?.canPublish;
  const field = "space-y-1.5";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" render={<Link href="/blog" />}><ArrowLeft className="h-4 w-4" /> Posts</Button>
          {status && <BlogStatusBadge status={status} />}
          {dirty && <span className="text-xs text-amber-700 dark:text-amber-400">Unsaved changes</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (
            <Button onClick={() => void save()} disabled={saving || (!dirty && !isNew)}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : isNew ? "Save draft" : "Save"}
            </Button>
          )}
          {status === "PUBLISHED" && post && (
            <Button variant="outline" render={<a href={`https://www.vision7.sa/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" />}>
              View on site
            </Button>
          )}
        </div>
      </div>

      {post?.reviewNote && status === "DRAFT" && (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <Warning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span><strong>Changes requested:</strong> {post.reviewNote}</span>
        </div>
      )}
      {!isNew && readOnly && access?.editBlockedReason && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">{access.editBlockedReason}</div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Main column */}
        <div className="space-y-4">
          <Input
            value={form.title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="Post title"
            aria-label="Post title"
            dir={dir}
            disabled={readOnly}
            maxLength={160}
            className="h-12 text-xl font-semibold md:text-2xl"
          />
          <RichTextEditor
            key={isNew ? "new" : `${id}:${post?.updatedAt}`}
            value={doc}
            onChange={onDoc}
            editable={!readOnly}
            dir={dir}
            placeholder={form.language === "ar" ? "ابدأ الكتابة…" : "Start writing…"}
          />
          <p className="text-xs text-muted-foreground">
            {facts.wordCount} words · about {Math.max(1, Math.ceil(facts.wordCount / 200))} min read
          </p>
        </div>

        {/* Side column */}
        <div className="space-y-4">
          {/* Workflow */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Publishing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {(canAssignPerm || post?.assignedTo) && (
                <div className={field}>
                  <Label>Assigned to</Label>
                  {canAssignPerm ? (
                    <Select items={staffItems} value={assignee || "none"} onValueChange={(v) => void changeAssignee(v === "none" ? "" : (v as string))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {staff.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm">{post?.assignedTo?.name || "—"}</p>
                  )}
                </div>
              )}

              {status === "SCHEDULED" && post?.scheduledAt && (
                <p className="text-sm text-muted-foreground">Goes live {new Date(post.scheduledAt).toLocaleString()}.</p>
              )}
              {status === "PUBLISHED" && post?.publishedAt && (
                <p className="text-sm text-muted-foreground">Live since {new Date(post.publishedAt).toLocaleDateString()}.</p>
              )}

              {isNew ? (
                <p className="text-sm text-muted-foreground">Save the draft first, then submit it for review or publish.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {status === "DRAFT" && canSubmit && (
                    <Button variant="outline" disabled={busy} onClick={() => void changeStatus("IN_REVIEW")}>Submit for review</Button>
                  )}
                  {(status === "DRAFT" || status === "IN_REVIEW") && canPublish && (
                    <>
                      <Button disabled={busy} onClick={() => void changeStatus("PUBLISHED")}>Publish now</Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setScheduleAt(toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
                          setScheduleOpen(true);
                        }}
                      >
                        Schedule…
                      </Button>
                    </>
                  )}
                  {status === "IN_REVIEW" && canPublish && (
                    <Button variant="outline" disabled={busy} onClick={() => { setChangesNote(""); setChangesOpen(true); }}>Request changes</Button>
                  )}
                  {status === "IN_REVIEW" && !canPublish && canSubmit && (
                    <Button variant="outline" disabled={busy} onClick={() => void changeStatus("DRAFT")}>Back to draft</Button>
                  )}
                  {status === "SCHEDULED" && canPublish && (
                    <>
                      <Button disabled={busy} onClick={() => void changeStatus("PUBLISHED")}>Publish now</Button>
                      <Button variant="outline" disabled={busy} onClick={() => void changeStatus("DRAFT")}>Unschedule</Button>
                    </>
                  )}
                  {status === "PUBLISHED" && canPublish && (
                    <>
                      <Button variant="outline" disabled={busy} onClick={() => void changeStatus("DRAFT")}>Unpublish</Button>
                      <Button variant="outline" disabled={busy} onClick={() => void changeStatus("ARCHIVED")}>Archive</Button>
                    </>
                  )}
                  {status === "ARCHIVED" && canPublish && (
                    <Button variant="outline" disabled={busy} onClick={() => void changeStatus("DRAFT")}>Restore to draft</Button>
                  )}
                  {access?.canDelete && (
                    <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</Button>
                  )}
                </div>
              )}
              {!canPublish && !isNew && status === "DRAFT" && (
                <p className="text-xs text-muted-foreground">An editor with publish rights puts approved posts on the website.</p>
              )}
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className={field}>
                <Label>Language</Label>
                <Select items={LANGUAGE_ITEMS} value={form.language} disabled={readOnly} onValueChange={(v) => { set("language", v as "en" | "ar"); set("translationOfId", ""); }}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">العربية (Arabic, right-to-left)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={field}>
                <Label>Translation of</Label>
                <Select items={translationItems} value={form.translationOfId || "none"} disabled={readOnly} onValueChange={(v) => set("translationOfId", v === "none" ? "" : (v as string))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Not a translation" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not a translation</SelectItem>
                    {translationOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Links the English and Arabic versions so search engines show the right one.</p>
              </div>
              <div className={field}>
                <Label htmlFor="blog-category">Category</Label>
                <Input id="blog-category" list="blog-categories" value={form.category} disabled={readOnly} maxLength={60} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Padel" />
                <datalist id="blog-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className={field}>
                <Label htmlFor="blog-tags">Tags</Label>
                <Input id="blog-tags" value={form.tags} disabled={readOnly} onChange={(e) => set("tags", e.target.value)} placeholder="padel, fitness, riyadh" />
                <p className="text-xs text-muted-foreground">Comma-separated, up to 15.</p>
              </div>
              <div className={field}>
                <Label htmlFor="blog-excerpt">Excerpt</Label>
                <Textarea id="blog-excerpt" dir={dir} rows={3} maxLength={400} value={form.excerpt} disabled={readOnly} onChange={(e) => set("excerpt", e.target.value)} placeholder="Two sentences shown on the blog page." />
              </div>
              <div className={field}>
                <Label>Cover image</Label>
                {form.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.coverImageUrl} alt={form.coverImageAlt || ""} className="aspect-[16/9] w-full rounded-md border object-cover" />
                )}
                {!readOnly && (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={coverUploading} onClick={() => coverRef.current?.click()}>
                      <Upload className="h-4 w-4" /> {coverUploading ? "Uploading…" : form.coverImageUrl ? "Replace" : "Upload"}
                    </Button>
                    {form.coverImageUrl && <Button type="button" variant="ghost" size="sm" onClick={() => set("coverImageUrl", "")}>Remove</Button>}
                  </div>
                )}
                <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => void uploadCover(e.target.files?.[0])} />
                <Input dir={dir} value={form.coverImageAlt} disabled={readOnly} maxLength={200} onChange={(e) => set("coverImageAlt", e.target.value)} placeholder="Describe the image (alt text)" aria-label="Cover image description" />
              </div>
            </CardContent>
          </Card>

          {/* SEO */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">SEO</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <SerpPreview
                title={form.seoTitle || form.title}
                slug={form.slug}
                description={form.metaDescription || form.excerpt}
                dir={dir}
              />
              <div className={field}>
                <Label htmlFor="blog-focus">Focus keyword</Label>
                <Input id="blog-focus" dir={dir} value={form.focusKeyword} disabled={readOnly} maxLength={80} onChange={(e) => set("focusKeyword", e.target.value)} placeholder="The phrase to rank for" />
              </div>
              <div className={field}>
                <div className="flex items-center justify-between">
                  <Label htmlFor="blog-seotitle">SEO title</Label>
                  <CharCount value={(form.seoTitle || form.title).length} min={TITLE_RANGE.min} max={TITLE_RANGE.max} />
                </div>
                <Input id="blog-seotitle" dir={dir} value={form.seoTitle} disabled={readOnly} maxLength={120} onChange={(e) => set("seoTitle", e.target.value)} placeholder={form.title || "Defaults to the post title"} />
              </div>
              <div className={field}>
                <div className="flex items-center justify-between">
                  <Label htmlFor="blog-meta">Meta description</Label>
                  <CharCount value={(form.metaDescription || form.excerpt).length} min={META_RANGE.min} max={META_RANGE.max} />
                </div>
                <Textarea id="blog-meta" dir={dir} rows={3} maxLength={320} value={form.metaDescription} disabled={readOnly} onChange={(e) => set("metaDescription", e.target.value)} placeholder="What search results show under the title." />
              </div>
              <div className={field}>
                <Label htmlFor="blog-slug">URL slug</Label>
                <Input
                  id="blog-slug"
                  dir="ltr"
                  value={form.slug}
                  disabled={readOnly}
                  maxLength={90}
                  onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value, 90)); }}
                  className="font-mono text-sm"
                />
                {status === "PUBLISHED" && (
                  <p className="text-xs text-muted-foreground">Changing the address of a live post keeps the old link working (it redirects).</p>
                )}
              </div>
              <div className={field}>
                <Label htmlFor="blog-og">Social share image</Label>
                <Input id="blog-og" dir="ltr" value={form.ogImageUrl} disabled={readOnly} onChange={(e) => set("ogImageUrl", e.target.value)} placeholder="https://… (defaults to the cover image)" />
              </div>
              <div className={field}>
                <Label htmlFor="blog-canonical">Canonical URL</Label>
                <Input id="blog-canonical" dir="ltr" value={form.canonicalUrl} disabled={readOnly} onChange={(e) => set("canonicalUrl", e.target.value)} placeholder="Only if this article first appeared elsewhere" />
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Hide from search engines
                  <span className="block text-xs text-muted-foreground">Adds noindex and leaves it out of the sitemap.</span>
                </span>
                <Switch checked={form.noindex} disabled={readOnly} onCheckedChange={(c) => set("noindex", !!c)} />
              </label>
              <SeoChecklist report={report} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Schedule */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule publishing</DialogTitle>
            <DialogDescription>The post goes live on vision7.sa at this time (your local time).</DialogDescription>
          </DialogHeader>
          <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} aria-label="Publish at" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button
              disabled={!scheduleAt || busy}
              onClick={() => {
                const at = new Date(scheduleAt);
                if (Number.isNaN(at.getTime())) return void toast.error("Pick a date and time.");
                setScheduleOpen(false);
                void changeStatus("SCHEDULED", { scheduledAt: at.toISOString() });
              }}
            >
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request changes */}
      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>The post goes back to draft and the writer is notified.</DialogDescription>
          </DialogHeader>
          <Textarea rows={4} maxLength={1000} value={changesNote} onChange={(e) => setChangesNote(e.target.value)} placeholder="What needs to change?" aria-label="Note to the writer" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangesOpen(false)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() => {
                setChangesOpen(false);
                void changeStatus("DRAFT", { reviewNote: changesNote.trim() || undefined });
              }}
            >
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this post?"
        description="It will be removed permanently. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={remove}
        loading={busy}
      />
    </div>
  );
}
