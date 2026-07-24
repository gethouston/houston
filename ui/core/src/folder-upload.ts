/**
 * Folder uploads (HOU-808 composer attachments, HOU-889 Files tab) — shared
 * by every surface that accepts a whole folder from the user.
 *
 * A folder can enter a surface two ways:
 *  - the folder picker (`<input webkitdirectory>`): the browser sets each
 *    File's `webkitRelativePath` natively;
 *  - drag-and-drop: `DataTransfer.files` flattens a folder to nothing, so the
 *    drop zone walks `webkitGetAsEntry()` trees and tags each produced File
 *    with the same `webkitRelativePath` shape (an own property shadowing the
 *    read-only prototype getter — the react-dropzone technique).
 *
 * Downstream, everything keys off `attachmentRelativePath(file)`: chips group
 * by folder root, dedupe keys include the path, and the upload client forwards
 * it so the host stores `uploads/<folder>/…` with structure intact.
 */

/** Hard ceiling on files attachable at once — a dropped `node_modules` must
 *  fail fast and loudly, not upload for an hour. Shared by the drop traversal
 *  (aborts early) and the intake (caps picker selections the same way). */
export const MAX_ATTACHMENT_FILES = 1000;

export class TooManyAttachmentFilesError extends Error {
  constructor() {
    super(`too many attachment files (max ${MAX_ATTACHMENT_FILES})`);
    this.name = "TooManyAttachmentFilesError";
  }
}

/**
 * The folder-relative path (`docs/guide/a.md`) of a folder-derived file, or
 * null for a plain attachment. Normalized to forward slashes, no leading
 * slash; a value without a `/` carries no structure and reads as plain.
 */
export function attachmentRelativePath(file: File): string | null {
  const raw = file.webkitRelativePath;
  if (!raw) return null;
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.includes("/") ? normalized : null;
}

/** The dropped/picked folder's name — the first path segment — or null. */
export function attachmentFolderRoot(file: File): string | null {
  return attachmentRelativePath(file)?.split("/", 1)[0] ?? null;
}

/** True when any path segment is hidden (dot-named): `.git/…`, `a/.DS_Store`. */
function isHiddenRelativePath(relPath: string): boolean {
  return relPath.split("/").some((segment) => segment.startsWith("."));
}

/**
 * Drop the hidden files a folder pick sweeps in (`.DS_Store`, `.git/**`) —
 * the host refuses dot-named upload segments, and silently failing the whole
 * send over an invisible file would be worse than skipping it. Plain files
 * (no relative path) pass through untouched: explicitly picking a dotfile
 * keeps its existing loud-rejection behavior.
 */
export function visibleAttachmentFiles(files: readonly File[]): File[] {
  return files.filter((file) => {
    const rel = attachmentRelativePath(file);
    return rel === null || !isHiddenRelativePath(rel);
  });
}

/** Tag a traversal-produced File so it reads exactly like a picker-produced
 *  one: an own `webkitRelativePath` shadowing the prototype's empty getter. */
function tagRelativePath(file: File, relPath: string): File {
  Object.defineProperty(file, "webkitRelativePath", {
    value: relPath,
    configurable: true,
  });
  return file;
}

/**
 * What a drop handed us, captured SYNCHRONOUSLY inside the drop event — the
 * DataTransfer is neutered once the handler returns, so `webkitGetAsEntry()` /
 * `getAsFile()` must both run before any await.
 */
export type DroppedItem =
  | { kind: "file"; file: File }
  | { kind: "entry"; entry: FileSystemEntry };

export function collectDroppedItems(dataTransfer: DataTransfer): DroppedItem[] {
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const supportsEntries =
    items.length > 0 && typeof items[0]?.webkitGetAsEntry === "function";
  if (!supportsEntries) {
    // No entry API (old engines): folders can't be traversed here — keep the
    // flat file list, exactly the pre-folder-support behavior.
    return Array.from(dataTransfer.files).map((file) => ({
      kind: "file",
      file,
    }));
  }
  const collected: DroppedItem[] = [];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry();
    if (entry) {
      collected.push({ kind: "entry", entry });
      continue;
    }
    const file = item.getAsFile();
    if (file) collected.push({ kind: "file", file });
  }
  return collected;
}

/**
 * Expand the captured drop into attachable Files: plain files pass through,
 * directory entries are walked recursively with each file tagged by its
 * folder-relative path. Hidden entries are skipped once INSIDE a folder (same
 * rationale as visibleAttachmentFiles); a top-level file keeps its loud
 * host-side rejection. Throws TooManyAttachmentFilesError past the ceiling.
 */
export async function resolveDroppedFiles(
  items: readonly DroppedItem[],
): Promise<File[]> {
  const out: File[] = [];
  for (const item of items) {
    if (item.kind === "file") {
      appendCapped(out, item.file);
      continue;
    }
    await appendEntry(item.entry, "", out);
  }
  return out;
}

async function appendEntry(
  entry: FileSystemEntry,
  parentDir: string,
  out: File[],
): Promise<void> {
  const nested = parentDir !== "";
  if ((nested || entry.isDirectory) && entry.name.startsWith(".")) return;
  if (entry.isFile) {
    const file = await entryFile(entry as FileSystemFileEntry);
    appendCapped(
      out,
      nested ? tagRelativePath(file, `${parentDir}/${file.name}`) : file,
    );
    return;
  }
  if (entry.isDirectory) {
    const dir = nested ? `${parentDir}/${entry.name}` : entry.name;
    for (const child of await readAllEntries(
      entry as FileSystemDirectoryEntry,
    )) {
      await appendEntry(child, dir, out);
    }
  }
}

function appendCapped(out: File[], file: File): void {
  if (out.length >= MAX_ATTACHMENT_FILES)
    throw new TooManyAttachmentFilesError();
  out.push(file);
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/**
 * Drain a directory reader fully — readEntries returns ≤100 per call. Bails
 * at the attachment ceiling DURING the drain so a huge flat directory (a
 * dropped node_modules) fails fast instead of enumerating everything first.
 * Slightly conservative: the count includes subdirectory and hidden entries
 * that would never become attachments — past 1000 of anything in one
 * directory, refusing is the right answer regardless.
 */
async function readAllEntries(
  dir: FileSystemDirectoryEntry,
): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return all;
    all.push(...batch);
    if (all.length > MAX_ATTACHMENT_FILES) {
      throw new TooManyAttachmentFilesError();
    }
  }
}
