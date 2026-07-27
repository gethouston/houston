import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { FAMILIES, schemaDoc } from "@houston/domain";
import { agentRoots } from "./chat-history";

/**
 * Re-seed every existing agent's `.houston/<family>/<family>.schema.json` with
 * the schema THIS build ships.
 *
 * The schemas are seeded once, at agent creation (`seedSchemas`), and are app
 * data — not user data. So an agent created before a schema gained a field kept
 * a stale copy forever, and stale copies are not inert: the product prompt tells
 * the model to read the schema and match it exactly, and every family schema is
 * `additionalProperties: false`. An agent reading a pre-HOU-946 learnings schema
 * (no `taught_by` / `mission_id` / `mission_title`) would conclude the
 * host-stamped provenance is invalid and strip it back out.
 *
 * Idempotent and cheap: the file is written only when its content differs, so a
 * steady-state boot is one small read per family per agent and zero writes (and
 * zero watcher churn — this also runs before the watcher starts).
 */

export interface ReseedSchemasResult {
  /** Agents where at least one schema file was rewritten this run. */
  updatedAgents: number;
  /** Individual schema files rewritten this run. */
  updatedFiles: number;
}

/** Write via tmp + rename so a crash mid-write never leaves a torn schema. */
function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${Date.now()}-${Math.random()}.tmp`);
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

/** Re-seed one agent, returning how many schema files it rewrote. Exported for
 *  tests; production goes through {@link reseedAgentSchemas}. */
export function reseedAgentSchema(
  agentRoot: string,
  log: (line: string) => void,
): number {
  const rewritten: string[] = [];
  for (const family of FAMILIES) {
    const path = join(agentRoot, ".houston", family, `${family}.schema.json`);
    const want = schemaDoc(family);
    let current: string | null = null;
    try {
      current = readFileSync(path, "utf8");
    } catch {
      current = null; // never seeded (or unreadable) — write it
    }
    if (current === want) continue;
    writeAtomic(path, want);
    rewritten.push(family);
  }
  // One line per AGENT, not per file: a first boot after a schema change would
  // otherwise print five lines per agent for a no-op-shaped event.
  if (rewritten.length) {
    log(`[agent-schemas] ${agentRoot}: re-seeded ${rewritten.join(", ")}`);
  }
  return rewritten.length;
}

/**
 * Re-seed every agent under the workspaces tree. Per-agent failures are logged
 * and skipped: a schema is a convenience for the model, and one unwritable agent
 * directory must never stop the host from booting (same posture as the
 * agent-layout migration this runs beside).
 */
export function reseedAgentSchemas(opts: {
  workspacesRoot: string;
  log?: (line: string) => void;
}): ReseedSchemasResult {
  const log = opts.log ?? ((l: string) => console.log(l));
  const result: ReseedSchemasResult = { updatedAgents: 0, updatedFiles: 0 };
  for (const agentRoot of agentRoots(opts.workspacesRoot)) {
    // Only agents that already have a `.houston/` DIRECTORY — never eagerly
    // create one for a random folder in the tree.
    try {
      if (!statSync(join(agentRoot, ".houston")).isDirectory()) continue;
    } catch {
      continue; // no .houston at all
    }
    try {
      const updated = reseedAgentSchema(agentRoot, log);
      if (updated > 0) {
        result.updatedAgents++;
        result.updatedFiles += updated;
      }
    } catch (err) {
      log(`[agent-schemas] ${agentRoot}: re-seed failed (skipping): ${err}`);
    }
  }
  return result;
}
