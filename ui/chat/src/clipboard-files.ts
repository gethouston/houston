export function fileIdentityKey(file: File): string {
  const name = file.webkitRelativePath || file.name;
  return `${name}::${file.size}::${file.lastModified}`;
}

interface ClipboardFileItem {
  kind: string;
  type?: string;
  getAsFile: () => File | null;
}

interface ClipboardFileData {
  files?: FileList | File[] | null;
  items?: Iterable<ClipboardFileItem> | ArrayLike<ClipboardFileItem> | null;
}

export type ClipboardPasteOutcome =
  | { kind: "files"; files: File[] }
  | { kind: "unavailable" }
  | { kind: "ignore" };

export function resolveClipboardPaste(
  data: ClipboardFileData | null | undefined,
): ClipboardPasteOutcome {
  const files = filesFromClipboardData(data);
  if (files.length > 0) return { kind: "files", files };
  if (clipboardSignalsImage(data)) return { kind: "unavailable" };
  return { kind: "ignore" };
}

export function clipboardSignalsImage(
  data: ClipboardFileData | null | undefined,
): boolean {
  if (!data?.items) return false;
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && (item.type ?? "").startsWith("image/")) {
      return true;
    }
  }
  return false;
}

export function filesFromClipboardData(
  data: ClipboardFileData | null | undefined,
): File[] {
  if (!data) return [];
  const candidates = filesFromClipboardItems(data.items);
  const raw =
    candidates.length > 0 ? candidates : filesFromClipboardList(data.files);
  return uniqueFiles(raw).map((file, index) => ensureFileName(file, index));
}

const EXT_FROM_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

function extensionForType(type: string): string {
  const mapped = EXT_FROM_MIME[type];
  if (mapped) return mapped;
  const sub = type.split("/")[1]?.split(/[;+]/)[0]?.trim() ?? "";
  return /^[a-z0-9]+$/i.test(sub) ? sub : "bin";
}

export function ensureFileName(file: File, index = 0): File {
  if (file.name && file.name.trim().length > 0) return file;
  const ext = extensionForType(file.type);
  const name = `pasted-${Date.now()}-${index}.${ext}`;
  return new File([file], name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export function filesFromClipboardItems(
  items:
    | Iterable<ClipboardFileItem>
    | ArrayLike<ClipboardFileItem>
    | null
    | undefined,
): File[] {
  if (!items) return [];

  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

function filesFromClipboardList(
  files: FileList | File[] | null | undefined,
): File[] {
  return files ? Array.from(files) : [];
}

function clipboardDedupeKey(file: File): string {
  return `${fileIdentityKey(file)}::${file.type}`;
}

function uniqueFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const unique: File[] = [];
  for (const file of files) {
    const key = clipboardDedupeKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(file);
  }
  return unique;
}
