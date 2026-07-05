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
): Promise<void> {
  if (claudeMd !== undefined) {
    await vfs.writeText(`${root}/CLAUDE.md`, claudeMd);
  }
  for (const [key, content] of Object.entries(seeds ?? {})) {
    const safe = safeSeedKey(key);
    if (!safe) throw new Error(`unsafe seed path: ${key}`);
    await vfs.writeText(`${root}/${safe}`, content);
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
