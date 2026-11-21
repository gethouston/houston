import { ACTIVITY_DOC, mergeActivityArrays } from "./activity-merge";
import { mergeKeyedArrays } from "./keyed-merge";
import {
  mergeRoutineRunArrays,
  ROUTINE_RUNS_DOC,
  ROUTINE_RUNS_MERGE_ROUNDS,
} from "./routine-runs-merge";

const ROUTINES_DOC = ".houston/routines/routines.json";
const LEARNINGS_DOC = ".houston/learnings/learnings.json";
const CUSTOM_DEFINITIONS = "custom-integrations.json";

function isPath(relativePath: string, documentPath: string): boolean {
  return (
    relativePath === documentPath || relativePath.endsWith(`/${documentPath}`)
  );
}

export function isMergedDocument(relativePath: string): boolean {
  return (
    arrayIdentity(relativePath) !== undefined ||
    isPath(relativePath, ACTIVITY_DOC) ||
    isPath(relativePath, ROUTINE_RUNS_DOC) ||
    relativePath === CUSTOM_DEFINITIONS
  );
}

export const MERGE_UPLOAD_ATTEMPTS = 6;

export function mergeUploadRounds(relativePath: string): number {
  return isPath(relativePath, ROUTINE_RUNS_DOC)
    ? ROUTINE_RUNS_MERGE_ROUNDS
    : MERGE_UPLOAD_ATTEMPTS;
}

export function mergesOnceOnConflict(relativePath: string): boolean {
  return (
    arrayIdentity(relativePath) !== undefined ||
    isPath(relativePath, ROUTINE_RUNS_DOC) ||
    relativePath === CUSTOM_DEFINITIONS
  );
}

export function keepsMergeBase(relativePath: string): boolean {
  return (
    isPath(relativePath, ACTIVITY_DOC) ||
    arrayIdentity(relativePath) !== undefined ||
    relativePath === CUSTOM_DEFINITIONS
  );
}

function parseBase(baseBody: string | undefined): unknown {
  if (baseBody === undefined) return undefined;
  try {
    return JSON.parse(baseBody) as unknown;
  } catch {
    return undefined;
  }
}

const arrayBase = (base: unknown) => (Array.isArray(base) ? base : undefined);

function definitionsBase(base: unknown): unknown[] | undefined {
  return isRecord(base) && base.version === 1 && Array.isArray(base.items)
    ? base.items
    : undefined;
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

function arrayItems(value: unknown, relativePath: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${relativePath} is not an array`);
  return value;
}

function objectDocument(value: unknown, relativePath: string) {
  if (!isRecord(value)) {
    throw new Error(`${relativePath} is not an object`);
  }
  return value;
}

export function mergeDocumentBodies(
  relativePath: string,
  localBody: string,
  remoteBody: string,
  baseBody?: string,
): string | undefined {
  if (!isMergedDocument(relativePath)) return undefined;
  const field = arrayIdentity(relativePath);
  const remote = JSON.parse(remoteBody) as unknown;
  const local = JSON.parse(localBody) as unknown;
  if (isPath(relativePath, ACTIVITY_DOC)) {
    if (!Array.isArray(remote) || !Array.isArray(local)) {
      throw new Error(`${relativePath} is not an array`);
    }
    const merged = mergeActivityArrays(
      remote,
      local,
      arrayBase(parseBase(baseBody)),
    );
    return `${JSON.stringify(merged, null, 2)}\n`;
  }
  if (isPath(relativePath, ROUTINE_RUNS_DOC)) {
    if (!Array.isArray(remote) || !Array.isArray(local)) {
      throw new Error(`${relativePath} is not an array`);
    }
    return `${JSON.stringify(mergeRoutineRunArrays(remote, local), null, 2)}\n`;
  }
  if (field) {
    if (!Array.isArray(remote) || !Array.isArray(local)) {
      throw new Error(`${relativePath} is not an array`);
    }
    const merged = mergeKeyedArrays(
      remote,
      local,
      field,
      arrayBase(parseBase(baseBody)),
    );
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
    items: mergeKeyedArrays(
      arrayItems(remoteShape.items, relativePath),
      arrayItems(localShape.items, relativePath),
      "slug",
      definitionsBase(parseBase(baseBody)),
    ),
  };
  return `${JSON.stringify(merged, null, 2)}\n`;
}

export function mergeOverDeleted(
  relativePath: string,
  localBody: string,
  baseBody: string | undefined,
): string | undefined {
  if (baseBody === undefined) return undefined;
  if (arrayIdentity(relativePath) !== undefined)
    return mergeDocumentBodies(relativePath, localBody, "[]", baseBody);
  if (relativePath === CUSTOM_DEFINITIONS)
    return mergeDocumentBodies(
      relativePath,
      localBody,
      JSON.stringify({ version: 1, items: [] }),
      baseBody,
    );
  return undefined;
}
