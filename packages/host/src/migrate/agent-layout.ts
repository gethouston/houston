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
import type { HoustonFamily } from "@houston/domain";
import { atomicTempPath } from "@houston/protocol";
import { agentRoots } from "./chat-history";

export const FLAT_FAMILIES: readonly HoustonFamily[] = [
  "activity",
  "routines",
  "routine_runs",
  "config",
];

export const LEGACY_LEARNINGS_MD = ".houston/memory/learnings.md";

export const LEGACY_PROMPT_FILES: readonly string[] = [
  ".houston/prompts/system.md",
  ".houston/prompts/self-improvement.md",
];

export interface MigrateLayoutResult {
  migratedAgents: number;
  migratedFiles: number;
}

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = atomicTempPath(
    join(dirname(path), `.${Date.now()}-${Math.random()}`),
  );
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

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

  const learningsMd = join(agentRoot, LEGACY_LEARNINGS_MD);
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

export function migrateAgentLayouts(opts: {
  workspacesRoot: string;
  log?: (line: string) => void;
}): MigrateLayoutResult {
  const log = opts.log ?? ((l: string) => console.log(l));
  const result: MigrateLayoutResult = { migratedAgents: 0, migratedFiles: 0 };
  for (const agentRoot of agentRoots(opts.workspacesRoot)) {
    const houstonDir = join(agentRoot, ".houston");
    try {
      if (!statSync(houstonDir).isDirectory()) continue;
    } catch {
      continue;
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
