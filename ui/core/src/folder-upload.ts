export const MAX_ATTACHMENT_FILES = 1000;

export class TooManyAttachmentFilesError extends Error {
  constructor() {
    super(`too many attachment files (max ${MAX_ATTACHMENT_FILES})`);
    this.name = "TooManyAttachmentFilesError";
  }
}

export function attachmentRelativePath(file: File): string | null {
  const raw = file.webkitRelativePath;
  if (!raw) return null;
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.includes("/") ? normalized : null;
}

export function attachmentFolderRoot(file: File): string | null {
  return attachmentRelativePath(file)?.split("/", 1)[0] ?? null;
}

function isHiddenRelativePath(relPath: string): boolean {
  return relPath.split("/").some((segment) => segment.startsWith("."));
}

export function visibleAttachmentFiles(files: readonly File[]): File[] {
  return files.filter((file) => {
    const rel = attachmentRelativePath(file);
    return rel === null || !isHiddenRelativePath(rel);
  });
}

function tagRelativePath(file: File, relPath: string): File {
  Object.defineProperty(file, "webkitRelativePath", {
    value: relPath,
    configurable: true,
  });
  return file;
}

export type DroppedItem =
  | { kind: "file"; file: File }
  | { kind: "entry"; entry: FileSystemEntry };

export function collectDroppedItems(dataTransfer: DataTransfer): DroppedItem[] {
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const supportsEntries =
    items.length > 0 && typeof items[0]?.webkitGetAsEntry === "function";
  if (!supportsEntries) {
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
