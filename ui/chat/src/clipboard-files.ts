/**
 * Stable identity for a user-attached File: name + size + lastModified.
 * Single source of truth so dedupe stays consistent across every entry
 * point (drop, picker, clipboard) and the multiple browser APIs that can
 * surface the same file twice.
 */
export function fileIdentityKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

// `kind`/`type` are loose `string` (not unions) on purpose: a real DOM
// `DataTransfer` must be structurally assignable here, and lib.dom types
// `DataTransferItem.kind` as `string`. Narrowing would break the call site.
interface ClipboardFileItem {
  kind: string;
  type?: string;
  getAsFile: () => File | null;
}

interface ClipboardFileData {
  files?: FileList | File[] | null;
  items?: Iterable<ClipboardFileItem> | ArrayLike<ClipboardFileItem> | null;
}

/**
 * What a paste event should do once the clipboard has been inspected:
 * - `files`       -> attach these
 * - `unavailable` -> an image was on the clipboard but the webview never
 *                    handed us the bytes (Linux Wayland WebKitGTK does not
 *                    surface image clipboards to the web layer). Tell the
 *                    user instead of swallowing it.
 * - `ignore`      -> nothing attachable; let the browser handle the paste
 *                    (e.g. plain text into the textarea).
 */
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

/**
 * True when the clipboard advertises an image file item but
 * `filesFromClipboardData` extracted nothing. This is the detectable half
 * of the Linux Wayland WebKitGTK limitation: webkitgtk lists the image
 * item yet `getAsFile()` returns null. The undetectable half (image-only
 * clipboard that webkitgtk hides entirely) cannot be observed from JS, so
 * native Wayland clipboard support is deliberately deferred off this
 * branch rather than faked. We surface every case we *can* see.
 */
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
  // `items` is the primary source: it's a superset of `files` and the two
  // often expose the same clipboard entry as different File objects with
  // different `lastModified` timestamps, causing dedup to fail and the same
  // image to appear twice. Use `items` when it yields anything; fall back to
  // `files` only for environments that don't support the items API.
  const candidates = filesFromClipboardItems(data.items);
  const raw =
    candidates.length > 0 ? candidates : filesFromClipboardList(data.files);
  // Index is post-dedupe so multiple unnamed files in one paste get distinct
  // generated names instead of colliding.
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
  // Strip any parameter/suffix (`text/plain;charset=utf-8`, `image/x+xml`)
  // so the generated name never carries `;`, `=`, or `+`.
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

// Dedupe key intentionally adds `type` on top of the shared identity:
// pasted screenshots usually have an empty name, so two genuinely
// different images would otherwise collide on `::size::lastModified`
// alone. Keeping this local (not in `fileIdentityKey`) leaves drop/picker
// dedupe semantics untouched.
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
