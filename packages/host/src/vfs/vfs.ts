import type { UploadStore } from "@houston/runtime-client/object-sync";
export interface ObjectStat {
  key: string;
  size: number;
  updatedMs: number;
  createdMs?: number;
}

export type KeyFold = "exact" | "folded";

// WHY: APFS folds by its own table and merges NFC/NFD; toLowerCase cannot predict it. ADR-0016
export interface KeyCase {
  fold: KeyFold;
  normalize: boolean;
}

export class VfsExistsError extends Error {
  constructor(readonly key: string) {
    super(`vfs destination already exists: ${key}`);
    this.name = "VfsExistsError";
  }
}

export class VfsReadOnlyError extends Error {
  constructor(
    readonly key: string,
    options?: { cause?: unknown },
  ) {
    super(`vfs storage refuses writes: ${key}`, options);
    this.name = "VfsReadOnlyError";
  }
}

export interface Vfs {
  readonly uploadStore?: UploadStore;
  copyUpload?(uploadId: string, key: string, generation: string): Promise<void>;
  keyCase(): Promise<KeyCase>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  listDetailed(prefix: string): Promise<ObjectStat[]>;
  readText(key: string): Promise<string | null>;
  readBytes(key: string, maxBytes?: number): Promise<Buffer | null>;
  writeText(key: string, content: string): Promise<void>;
  writeBytes(key: string, content: Buffer): Promise<void>;
  writeFileFrom?(key: string, sourcePath: string): Promise<void>;
  deleteKey(key: string): Promise<void>;
  move(fromKey: string, toKey: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

export class VfsReadLimitError extends Error {
  constructor() {
    super("File exceeds the bounded read limit");
  }
}

// WHY: Node keeps a UTF-8 BOM and JSON.parse rejects it; Windows editors write one. ADR-0016
export function decodeText(bytes: Buffer): string {
  const text = bytes.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function assertSafeKey(key: string): void {
  if (
    key.startsWith("/") ||
    key.split("/").some((seg) => seg === "" || seg === "." || seg === "..")
  ) {
    throw new Error(`unsafe vfs key: ${key}`);
  }
}
