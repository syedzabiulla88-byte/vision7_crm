"use client";

import { useRef, useState, useCallback, DragEvent } from "react";
import { Upload, FileUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/api";
import { toast } from "sonner";

export interface UploadedFile {
  url: string;
  fileKey: string;
  name: string;
  size: number;
  mimeType: string;
}

interface FileUploadProps {
  /** File category — controls MIME validation on backend */
  category?: "image" | "pdf" | "video" | "file";
  /** S3 sub-folder for organisation (e.g. "avatars", "event-attachments") */
  folder?: string;
  /** Allow multiple files at once */
  multiple?: boolean;
  /** HTML `accept` attribute for the file dialog (e.g. "image/*", ".pdf,.docx") */
  accept?: string;
  /** Called when a file finishes uploading */
  onUpload: (file: UploadedFile) => void;
  /** Called on error */
  onError?: (err: Error) => void;
  /** Max size (bytes). Defaults based on category */
  maxSize?: number;
  /** Compact single-button mode (no drop-zone) */
  compact?: boolean;
  /** Optional label for drop zone */
  label?: string;
  /** Optional sub-label */
  hint?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Custom className for the root */
  className?: string;
}

const DEFAULT_LIMITS: Record<string, number> = {
  image: 10 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  file: 50 * 1024 * 1024,
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileUpload({
  category = "file",
  folder = "uploads",
  multiple = false,
  accept,
  onUpload,
  onError,
  maxSize,
  compact = false,
  label,
  hint,
  disabled = false,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const maxBytes = maxSize || DEFAULT_LIMITS[category];
  const defaultAccept =
    accept ||
    (category === "image" ? "image/jpeg,image/png,image/webp,image/gif" :
     category === "pdf" ? "application/pdf" :
     category === "video" ? "video/mp4,video/webm,video/quicktime" :
     "*");

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    for (const file of list) {
      if (file.size > maxBytes) {
        const msg = `"${file.name}" is too large — max ${formatSize(maxBytes)}`;
        toast.error(msg);
        onError?.(new Error(msg));
        continue;
      }

      setUploading(true);
      setProgress((p) => ({ ...p, [file.name]: 0 }));

      try {
        const uploaded = await uploadFile(file, {
          category,
          folder,
          onProgress: (pct) => setProgress((p) => ({ ...p, [file.name]: pct })),
        });
        onUpload(uploaded);
        toast.success(`Uploaded "${file.name}"`);
      } catch (err: any) {
        console.error("Upload failed:", err);
        toast.error("Upload failed", { description: err?.message });
        onError?.(err);
      } finally {
        setProgress((p) => {
          const next = { ...p };
          delete next[file.name];
          return next;
        });
      }
    }
    setUploading(false);
  }, [category, folder, maxBytes, onUpload, onError]);

  const openPicker = () => !disabled && inputRef.current?.click();

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) handleFiles(files);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleFiles(files);
    e.target.value = ""; // reset so same file can be chosen twice
  };

  // Compact mode: just a button
  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || uploading}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 text-xs border rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed",
            className,
          )}
        >
          <FileUp className="h-3.5 w-3.5" />
          {uploading ? "Uploading..." : label || "Upload"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={defaultAccept}
          multiple={multiple}
          onChange={onChange}
          className="hidden"
        />
      </>
    );
  }

  // Drop zone mode
  return (
    <div className={cn("space-y-2", className)}>
      <div
        onClick={openPicker}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-muted-foreground/50",
          disabled && "opacity-50 pointer-events-none",
        )}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">
          {label || `Click or drag ${category === "file" ? "file" : category} here`}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {hint || `Max ${formatSize(maxBytes)}${multiple ? " · multiple files allowed" : ""}`}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={defaultAccept}
          multiple={multiple}
          onChange={onChange}
          onClick={(e) => e.stopPropagation()}
          className="hidden"
        />
      </div>

      {/* Upload progress */}
      {Object.entries(progress).map(([name, pct]) => (
        <div key={name} className="flex items-center gap-2 text-xs">
          <span className="flex-1 truncate">{name}</span>
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
        </div>
      ))}
    </div>
  );
}

/** Display for an existing uploaded attachment with remove button */
export function AttachmentPreview({
  name,
  url,
  size,
  onRemove,
  className,
}: {
  name: string;
  url?: string;
  size?: number;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 border rounded-md p-2 text-xs", className)}>
      <FileUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:underline">
          {name}
        </a>
      ) : (
        <span className="flex-1 truncate">{name}</span>
      )}
      {size !== undefined && (
        <span className="text-muted-foreground tabular-nums">{formatSize(size)}</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
