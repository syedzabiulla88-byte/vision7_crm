"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Heading4,
  ImageIcon,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { uploadFile } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  /** ProseMirror JSON (or null for a new post). Read once on mount — remount to load another post. */
  value: unknown;
  onChange: (doc: unknown) => void;
  editable: boolean;
  dir: "ltr" | "rtl";
  placeholder?: string;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Mirrors the server: only https / http / mailto / tel / site paths survive. */
function normaliseHref(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^(\/|#)/.test(v) && !v.startsWith("//")) return v;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  // "vision7.sa/x" typed without a scheme
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(v)) return `https://${v}`;
  return null;
}

export function RichTextEditor({ value, onChange, editable, dir, placeholder }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    content: (value as object | null) ?? "",
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? "Start writing…" }),
    ],
    onUpdate: ({ editor: e }) => onChangeRef.current(e.getJSON()),
    editorProps: {
      attributes: {
        class: "blog-editor-content min-h-[26rem] px-4 py-3 outline-none",
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkOpen(true);
  }, [editor]);

  const applyLink = () => {
    if (!editor) return;
    if (!linkUrl.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const href = normaliseHref(linkUrl);
    if (!href) {
      toast.error("Use a full https:// address, a /page on this site, mailto: or tel:.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file || !editor) return;
    if (!file.type.startsWith("image/")) return void toast.error("Pick an image file.");
    if (file.size > MAX_IMAGE_BYTES) return void toast.error("Images can be at most 10 MB.");
    setUploading(true);
    try {
      const { url } = await uploadFile(file, { category: "image", folder: "blog" });
      const alt = window.prompt("Describe this image (for screen readers and image search):", "") ?? "";
      editor.chain().focus().setImage({ src: url, alt: alt.trim() }).run();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      {editable && (
        <Toolbar
          editor={editor}
          uploading={uploading}
          onLink={openLinkDialog}
          onImage={() => fileRef.current?.click()}
        />
      )}
      <div dir={dir} lang={dir === "rtl" ? "ar" : "en"}>
        <EditorContent editor={editor} />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => onPickImage(e.target.files?.[0])}
      />

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="blog-link-url">Address</Label>
            <Input
              id="blog-link-url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://vision7.sa/memberships"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">Leave empty to remove the link.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyLink}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolBtn({
  label,
  active,
  onClick,
  disabled,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the selection in the editor
      onClick={onClick}
      className={cn(active && "bg-accent text-accent-foreground")}
    >
      {children}
    </Button>
  );
}

const ToolSep = () => <span className="mx-1 h-5 w-px bg-border" aria-hidden />;

function Toolbar({
  editor,
  uploading,
  onLink,
  onImage,
}: {
  editor: Editor | null;
  uploading: boolean;
  onLink: () => void;
  onImage: () => void;
}) {
  // Re-render on selection / content change so active states stay right.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => force((n) => n + 1);
    editor.on("transaction", bump);
    return () => void editor.off("transaction", bump);
  }, [editor]);

  if (!editor) return <div className="h-10 border-b bg-muted/30" />;

  const Btn = ToolBtn;
  const Sep = ToolSep;
  const run = () => editor.chain().focus();

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5" role="toolbar" aria-label="Formatting">
      <Btn label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => run().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Btn>
      <Btn label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => run().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></Btn>
      <Btn label="Heading 4" active={editor.isActive("heading", { level: 4 })} onClick={() => run().toggleHeading({ level: 4 }).run()}><Heading4 className="h-4 w-4" /></Btn>
      <Sep />
      <Btn label="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => run().toggleBold().run()}><Bold className="h-4 w-4" /></Btn>
      <Btn label="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => run().toggleItalic().run()}><Italic className="h-4 w-4" /></Btn>
      <Btn label="Underline (Ctrl+U)" active={editor.isActive("underline")} onClick={() => run().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></Btn>
      <Btn label="Strikethrough" active={editor.isActive("strike")} onClick={() => run().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Btn>
      <Btn label="Inline code" active={editor.isActive("code")} onClick={() => run().toggleCode().run()}><Code className="h-4 w-4" /></Btn>
      <Sep />
      <Btn label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => run().toggleBulletList().run()}><List className="h-4 w-4" /></Btn>
      <Btn label="Numbered list" active={editor.isActive("orderedList")} onClick={() => run().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Btn>
      <Btn label="Quote" active={editor.isActive("blockquote")} onClick={() => run().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Btn>
      <Btn label="Divider" onClick={() => run().setHorizontalRule().run()}><Minus className="h-4 w-4" /></Btn>
      <Sep />
      <Btn label="Add or edit link" active={editor.isActive("link")} onClick={onLink}><Link2 className="h-4 w-4" /></Btn>
      <Btn label="Remove link" disabled={!editor.isActive("link")} onClick={() => run().extendMarkRange("link").unsetLink().run()}><Link2Off className="h-4 w-4" /></Btn>
      <Btn label={uploading ? "Uploading…" : "Insert image"} disabled={uploading} onClick={onImage}><ImageIcon className="h-4 w-4" /></Btn>
      <Sep />
      <Btn label="Undo" disabled={!editor.can().undo()} onClick={() => run().undo().run()}><Undo2 className="h-4 w-4" /></Btn>
      <Btn label="Redo" disabled={!editor.can().redo()} onClick={() => run().redo().run()}><Redo2 className="h-4 w-4" /></Btn>
    </div>
  );
}
