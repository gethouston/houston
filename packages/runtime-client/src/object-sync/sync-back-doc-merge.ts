import { randomUUID } from "node:crypto";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { fileSha256 } from "./file-hash";
import type { ObjectStore } from "./object-store";

const ROUTINES_DOC = ".houston/routines/routines.json";
const LEARNINGS_DOC = ".houston/learnings/learnings.json";
const CUSTOM_DEFINITIONS = "custom-integrations.json";

function isPath(relativePath: string, documentPath: string): boolean {
  return (
    relativePath === documentPath || relativePath.endsWith(`/${documentPath}`)
  );
}

function arrayIdentity(relativePath: string): string | undefined {
  return isPath(relativePath, ROUTINES_DOC) ||
    isPath(relativePath, LEARNINGS_DOC)
    ? "id"
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identity(value: unknown, field: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[field];
  return typeof candidate === "string" ? candidate : undefined;
}

function objectDocument(value: unknown, relativePath: string) {
  if (!isRecord(value)) {
    throw new Error(`${relativePath} is not an object`);
  }
  return value;
}

function mergeArrayDocument(
  remote: unknown,
  local: unknown,
  field: string,
  relativePath: string,
): unknown[] {
  if (!Array.isArray(remote) || !Array.isArray(local)) {
    throw new Error(`${relativePath} is not an array`);
  }
  const localIds = new Set(
    local.map((item) => identity(item, field)).filter((id) => id !== undefined),
  );
  return [
    ...remote.filter((item) => {
      const id = identity(item, field);
      return id === undefined || !localIds.has(id);
    }),
    ...local,
  ];
}

/** Merge local document entries into a refreshed remote document. */
export function mergeDocumentBodies(
  relativePath: string,
  localBody: string,
  remoteBody: string,
): string | undefined {
  const field = arrayIdentity(relativePath);
  if (!field && relativePath !== CUSTOM_DEFINITIONS) return undefined;
  const remote = JSON.parse(remoteBody) as unknown;
  const local = JSON.parse(localBody) as unknown;
  if (field) {
    const merged = mergeArrayDocument(remote, local, field, relativePath);
    return `${JSON.stringify(merged, null, 2)}\n`;
  }
  const remoteShape = objectDocument(remote, relativePath);
  const localShape = objectDocument(local, relativePath);
  if (remoteShape.version !== 1 || localShape.version !== 1) {
    throw new Error(`${relativePath} has an unsupported version`);
  }
  const merged = {
    ...remoteShape,
    ...localShape,
    items: mergeArrayDocument(
      remoteShape.items,
      localShape.items,
      "slug",
      relativePath,
    ),
  };
  return `${JSON.stringify(merged, null, 2)}\n`;
}

/** Merge a conflict-sensitive document and replace its local copy. */
export async function mergeSyncBackDocument(opts: {
  store: ObjectStore;
  abs: string;
  key: string;
  relativePath: string;
}): Promise<string | undefined> {
  if (
    !arrayIdentity(opts.relativePath) &&
    opts.relativePath !== CUSTOM_DEFINITIONS
  ) {
    return undefined;
  }
  const localBody = await readFile(opts.abs, "utf8");
  const remoteTemp = `${opts.abs}.${randomUUID()}.remote.tmp`;
  try {
    await opts.store.download(opts.key, remoteTemp);
    const remoteBody = await readFile(remoteTemp, "utf8");
    const merged = mergeDocumentBodies(
      opts.relativePath,
      localBody,
      remoteBody,
    );
    if (merged === undefined) return undefined;
    await writeFile(opts.abs, merged);
    const { size } = await stat(opts.abs);
    return fileSha256(opts.abs, size);
  } finally {
    await rm(remoteTemp, { force: true });
  }
}
