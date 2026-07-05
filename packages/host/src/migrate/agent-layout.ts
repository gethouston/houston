import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { agentRoots } from "./chat-history";

/**
 * One-time migration of the pre-v0.4 FLAT `.houston/` layout into the per-type
 * folder layout the domain reads (`.houston/<family>/<family>.json` — see
 * packages/domain/src/layout.ts). Ported from the Rust engine's
 * `houston_agent_files::migrate_agent_data`, which ran on every desktop boot
 * until the final cutover; without it, a v0.3.x-era install upgrading straight
 * to the single-engine build would see empty Activity/Routines/Learnings.
 *
 * Steps (all idempotent — old-exists && new-missing, originals left in place
 * as a rollback safety net):
 *   - `.houston/<f>.json`          → `.houston/<f>/<f>.json` for
 *     activity / routines / routine_runs / config
 *   - `.houston/memory/learnings.md` (markdown bullets)
 *                                  → `.houston/learnings/learnings.json`
 *   - delete `.houston/prompts/{system,self-improvement}.md` (product-layer
 *     prompt files earlier versions seeded; never user-editable)
 *
 * Legacy model aliases (`"opus"`/`"sonnet"`) in the migrated config need no
 * rewrite here: packages/domain/src/provider-model.ts maps them at read time.
 */

const FLAT_FAMILIES = ["activity", "routines", "routine_runs", "config"];

const LEGACY_PROMPT_FILES = [
  join(".houston", "prompts", "system.md"),
  join(".houston", "prompts", "self-improvement.md"),
];

export interface MigrateLayoutResult {
  /** Agents where at least one legacy file was migrated this run. */
  migratedAgents: number;
  /** Individual files moved into the per-type layout this run. */
  migratedFiles: number;
}

/** Write via tmp + rename so a crash mid-write never leaves a torn file. */
function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${Date.now()}-${Math.random()}.tmp`);
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

/** `- ` / `* ` markdown bullets → learnings.json entries (schema: id/text/created_at). */
export function learningsFromMarkdown(md: string, now: string): unknown[] {
  const entries: unknown[] = [];
  for (const line of md.split("\n")) {
    const t = line.trim();
    const stripped = (
      t.startsWith("- ") || t.startsWith("* ") ? t.slice(2) : t
    ).trim();
    if (stripped) {
      entries.push({
        id: crypto.randomUUID(),
        text: stripped,
        created_at: now,
      });
    }
  }
  return entries;
}

/** Migrate one agent. Exported for tests; production goes through {@link migrateAgentLayouts}. */
export function migrateAgentLayout(
  agentRoot: string,
  log: (line: string) => void,
): number {
  let migrated = 0;

  for (const family of FLAT_FAMILIES) {
    const oldPath = join(agentRoot, ".houston", `${family}.json`);
    const newPath = join(agentRoot, ".houston", family, `${family}.json`);
    if (existsSync(oldPath) && !existsSync(newPath)) {
      writeAtomic(newPath, readFileSync(oldPath, "utf8"));
      migrated++;
      log(`[agent-layout] ${agentRoot}: migrated flat ${family}.json`);
    }
  }

  const learningsMd = join(agentRoot, ".houston", "memory", "learnings.md");
  const learningsNew = join(
    agentRoot,
    ".houston",
    "learnings",
    "learnings.json",
  );
  if (existsSync(learningsMd) && !existsSync(learningsNew)) {
    const entries = learningsFromMarkdown(
      readFileSync(learningsMd, "utf8"),
      new Date().toISOString(),
    );
    writeAtomic(learningsNew, JSON.stringify(entries, null, 2));
    migrated++;
    log(
      `[agent-layout] ${agentRoot}: migrated learnings.md (${entries.length} entries)`,
    );
  }

  for (const rel of LEGACY_PROMPT_FILES) {
    const path = join(agentRoot, rel);
    if (existsSync(path)) {
      unlinkSync(path);
      log(`[agent-layout] ${agentRoot}: removed legacy prompt file ${rel}`);
    }
  }

  return migrated;
}

/**
 * Migrate every agent under the workspaces tree. Per-agent failures are logged
 * and skipped (boot context: one unreadable agent must not block the rest —
 * same posture as the chat-history migration this runs beside).
 */
export function migrateAgentLayouts(opts: {
  workspacesRoot: string;
  log?: (line: string) => void;
}): MigrateLayoutResult {
  const log = opts.log ?? ((l: string) => console.log(l));
  const result: MigrateLayoutResult = { migratedAgents: 0, migratedFiles: 0 };
  for (const agentRoot of agentRoots(opts.workspacesRoot)) {
    // Only agents that already have a `.houston/` DIRECTORY — never eagerly
    // create one for a random folder in the tree.
    const houstonDir = join(agentRoot, ".houston");
    try {
      if (!statSync(houstonDir).isDirectory()) continue;
    } catch {
      continue; // no .houston at all
    }
    try {
      const migrated = migrateAgentLayout(agentRoot, log);
      if (migrated > 0) {
        result.migratedAgents++;
        result.migratedFiles += migrated;
      }
    } catch (err) {
      log(`[agent-layout] ${agentRoot}: migration failed (skipping): ${err}`);
    }
  }
  return result;
}
