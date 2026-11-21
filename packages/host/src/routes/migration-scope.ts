export type MigrationKind = "core" | "file";

export const MAX_MIGRATION_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_BODY_BYTES = 64 * 1024 * 1024;
export const MAX_IMPORT_UNPACKED_BYTES = 512 * 1024 * 1024;
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

export function classifyMigrationPath(rel: string): MigrationKind | null {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  if (base === ".DS_Store" || rel.endsWith(".schema.json")) return null;
  if (EXCLUDED_EXACT.has(rel)) return null;
  if (CORE_EXACT.has(rel)) return "core";
  if (CORE_PREFIXES.some((p) => rel.startsWith(p))) return "core";
  if (rel.split("/").some((seg) => seg.startsWith("."))) return null;
  return "file";
}

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
