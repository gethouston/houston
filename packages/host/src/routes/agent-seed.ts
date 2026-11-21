import { jsonDoc, parseJsonDoc } from "@houston/domain";
import type { Vfs } from "../vfs";

export function safeSeedKey(key: string): string | null {
  if (!key || key.startsWith("/") || key.includes("\0") || key.includes("\\")) {
    return null;
  }
  for (const seg of key.split("/")) {
    if (seg === "" || seg === "." || seg === "..") return null;
  }
  return key;
}

export interface AgentSeed {
  claudeMd?: string;
  seeds?: Record<string, string>;
}

const ROUTINE_DOC_KEYS: ReadonlySet<string> = new Set([
  ".houston/routines/routines.json",
  ".houston/routines.json",
]);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function stampRoutineCreator(
  content: string,
  actor: string | undefined,
): string {
  let parsed: unknown;
  try {
    parsed = parseJsonDoc(content, "routines.json");
  } catch {
    return content;
  }
  if (!Array.isArray(parsed)) return content;
  const stamped = parsed.map((entry) => {
    if (!isRecord(entry)) return entry;
    const { created_by: _fromClient, ...routine } = entry;
    return actor ? { ...routine, created_by: actor } : routine;
  });
  return jsonDoc(stamped);
}

export function importedFileBytes(
  rel: string,
  data: Uint8Array,
  actor: string | undefined,
): Buffer {
  const bytes = Buffer.from(data);
  if (!ROUTINE_DOC_KEYS.has(rel)) return bytes;
  return Buffer.from(stampRoutineCreator(bytes.toString("utf8"), actor));
}

export async function writeAgentSeeds(
  vfs: Vfs,
  root: string,
  { claudeMd, seeds }: AgentSeed,
  routineCreatedBy?: string,
): Promise<void> {
  if (claudeMd !== undefined) {
    await vfs.writeText(`${root}/CLAUDE.md`, claudeMd);
  }
  for (const [key, content] of Object.entries(seeds ?? {})) {
    const safe = safeSeedKey(key);
    if (!safe) throw new Error(`unsafe seed path: ${key}`);
    const body = ROUTINE_DOC_KEYS.has(safe)
      ? stampRoutineCreator(content, routineCreatedBy)
      : content;
    await vfs.writeText(`${root}/${safe}`, body);
  }
}

export function asSeedRecord(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string") return null;
    out[k] = v;
  }
  return out;
}
