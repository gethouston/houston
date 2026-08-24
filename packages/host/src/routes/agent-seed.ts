import type { Vfs } from "../vfs";

/**
 * Validate a seed's relative key: it must stay inside the agent root.
 *
 * Returns the key unchanged when safe, or `null` when it would escape the
 * root (absolute path, empty, backslashes, NUL, or any `.`/`..`/empty
 * segment). Seed maps are client-supplied on `POST /agents`, so a buggy or
 * hostile key must never let a write land outside `<root>/`.
 */
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
  /** CLAUDE.md instructions, written verbatim to `<root>/CLAUDE.md`. */
  claudeMd?: string;
  /** Flat `relativePath → contents` map written verbatim under `<root>/`. */
  seeds?: Record<string, string>;
}

/** The agent-layout routines doc, relative to the agent root — the ONE seed
 *  key whose entries carry per-routine acting identity (`created_by`). */
const ROUTINES_SEED_KEY = ".houston/routines/routines.json";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Stamp `created_by` onto seeded routines that carry none. Seeded routines
 * (builtin templates, portable installs — which strip the exporter's identity
 * on pack) bypass createRoutine, so without this they are born authorless, and
 * the control-plane fire planner treats an authorless routine as not fireable.
 * Entries that already name a creator keep it. Malformed JSON or a non-array
 * doc is stored verbatim: normalizeRoutines reports it on the first read, and
 * inventing structure here would mask that diagnostic.
 */
export function stampRoutineSeedCreator(content: string, sub: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  if (!Array.isArray(parsed)) return content;
  let changed = false;
  const stamped = parsed.map((entry) => {
    if (!isRecord(entry)) return entry;
    if (typeof entry.created_by === "string" && entry.created_by) return entry;
    changed = true;
    return { ...entry, created_by: sub };
  });
  return changed ? `${JSON.stringify(stamped, null, 2)}\n` : content;
}

/**
 * Write an agent's initial files under `root` in the vfs: its CLAUDE.md and a
 * flat map of seed files (skills at `.agents/skills/<slug>/SKILL.md`, seeded
 * `.houston` data, working files). This is the SAME `seeds` contract the wire
 * `CreateAgent` request carries and the Rust engine honored on install — the
 * host must write them too, or every non-AI agent (builtin templates, portable
 * installs) is created with no instructions and no skills.
 *
 * A key that would escape the agent root throws rather than being skipped: a
 * create that asked to seed and could not must fail loudly (beta policy — no
 * silent, half-provisioned agents).
 */
export async function writeAgentSeeds(
  vfs: Vfs,
  root: string,
  { claudeMd, seeds }: AgentSeed,
  // The verified acting identity of the create (C2), stamped as `created_by`
  // on seeded routines that carry none — see stampRoutineSeedCreator.
  routineCreatedBy?: string,
): Promise<void> {
  if (claudeMd !== undefined) {
    await vfs.writeText(`${root}/CLAUDE.md`, claudeMd);
  }
  for (const [key, content] of Object.entries(seeds ?? {})) {
    const safe = safeSeedKey(key);
    if (!safe) throw new Error(`unsafe seed path: ${key}`);
    const body =
      safe === ROUTINES_SEED_KEY && routineCreatedBy
        ? stampRoutineSeedCreator(content, routineCreatedBy)
        : content;
    await vfs.writeText(`${root}/${safe}`, body);
  }
}

/**
 * Narrow an untrusted JSON value to a `Record<string, string>` (the `seeds`
 * shape). Returns `null` when the value is not a plain object of string
 * values, so the caller can reject it with a 400 instead of writing garbage.
 */
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
