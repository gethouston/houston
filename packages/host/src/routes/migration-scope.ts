/**
 * What the one-click desktop→cloud migration carries (HOU-719). One shared
 * classifier so the source manifest, the export re-validation, and the
 * import-side allowlist can never drift: a path either migrates as agent
 * `core` data, migrates as a working `file`, or stays behind (`null`).
 *
 * Deliberately left behind:
 *  - `.houston/sessions/**` — Rust-era provider `.sid`/`.history` trackers,
 *    already consumed by the boot chat-history migration (linkage.ts).
 *  - `.houston/runtime/sessions/**` — pi sessions are cwd-anchored; the import
 *    route re-synthesizes them on the target from the transcripts instead.
 *  - `.houston/integrations.json` — the retired per-user Composio state (it can
 *    hold a plaintext key). The manifest reads toolkit NAMES out of it so the
 *    new app can prompt reconnects, but the file itself never leaves the disk.
 *  - `AGENTS.md`/`GEMINI.md` — symlink mirrors of CLAUDE.md; the target seeds
 *    its own.
 *  - schema seeds, the `.migrated` marker, prompt overlays, and every other
 *    dot-path: the target host owns those.
 */

export type MigrationKind = "core" | "file";

/** Per-file ceiling: anything larger stays on disk and is reported, not sent. */
export const MAX_MIGRATION_FILE_BYTES = 50 * 1024 * 1024;
/** Compressed upload body ceiling per import request (the client chunks). */
export const MAX_IMPORT_BODY_BYTES = 64 * 1024 * 1024;
/** Decompressed ceiling per import request — zip-bomb guard. */
export const MAX_IMPORT_UNPACKED_BYTES = 512 * 1024 * 1024;
/** Entry-count ceiling per import request — zip-bomb guard. */
export const MAX_IMPORT_ENTRIES = 10_000;

const CORE_EXACT = new Set(["CLAUDE.md", ".houston/agent.json"]);

const CORE_PREFIXES = [
  ".agents/skills/",
  ".houston/activity/",
  ".houston/routines/",
  ".houston/routine_runs/",
  ".houston/config/",
  ".houston/learnings/",
  ".houston/runtime/conversations/",
];

const EXCLUDED_EXACT = new Set(["AGENTS.md", "GEMINI.md"]);

/**
 * Classify one agent-root-relative path. `rel` must already be a safe relative
 * key (the routes validate with `safeSeedKey` before calling).
 */
export function classifyMigrationPath(rel: string): MigrationKind | null {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  if (base === ".DS_Store" || rel.endsWith(".schema.json")) return null;
  if (EXCLUDED_EXACT.has(rel)) return null;
  if (CORE_EXACT.has(rel)) return "core";
  if (CORE_PREFIXES.some((p) => rel.startsWith(p))) return "core";
  // Any other dot-path is host/engine internals (.houston/sessions, prompts,
  // .claude symlinks, .git, …) — never migrated.
  if (rel.split("/").some((seg) => seg.startsWith("."))) return null;
  return "file";
}

/**
 * Toolkit slugs out of the Rust-era per-agent `.houston/integrations.json`,
 * best-effort. The Rust engine accepted two shapes (see the old
 * prompt.rs): an array of `{toolkit}` objects, or a map keyed by toolkit
 * name. Anything unparseable reads as "no recorded integrations" — this
 * feeds a reconnect CHECKLIST, never a data write.
 */
export function toolkitsFromIntegrationsJson(content: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) {
    const out: string[] = [];
    for (const item of parsed) {
      const toolkit = (item as { toolkit?: unknown } | null)?.toolkit;
      if (typeof toolkit === "string" && toolkit) out.push(toolkit);
    }
    return [...new Set(out)];
  }
  if (typeof parsed === "object" && parsed !== null) {
    return Object.keys(parsed);
  }
  return [];
}
