import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentRoots } from "./chat-history";

/**
 * Backfill `created_by` on routines recorded before gateway-fronted pods
 * stamped acting identities.
 *
 * The control-plane routine planner refuses to fire a routine whose snapshot
 * names no creator (there is no identity to re-authorize or bill the fired
 * turn against), so every such routine rides only the legacy pre-wake path —
 * and stops running entirely once pre-wake suppression turns on. The snapshot
 * is projected from this very file on its next store-sync upload, so stamping
 * here is the whole repair: no control-plane write is involved.
 *
 * The stamp is the ORG OWNER's canonical user id (the managed pod's owner env),
 * not a synthetic principal: fire-time delivery requires the acting identity
 * to equal `created_by`, and only a real directory user can be minted an
 * acting token — a synthetic sub would leave the routine exactly as unfireable
 * as no sub at all. Edits keep healing forward: any later verified actor
 * re-stamps the routine as usual.
 *
 * Idempotent and minimal: only entries with no non-empty `created_by` gain the
 * key; everything else in the doc — malformed entries included, they are the
 * read path's diagnostics to report — round-trips untouched, and a doc with
 * nothing to stamp is not rewritten.
 */

export interface BackfillCreatedByResult {
  /** Agents whose routines doc was rewritten this run. */
  updatedAgents: number;
  /** Individual routine entries stamped this run. */
  updatedRoutines: number;
}

const ROUTINES_DOC = join(".houston", "routines", "routines.json");

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Write via tmp + rename so a crash mid-write never leaves a torn doc. */
function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${Date.now()}-${Math.random()}.tmp`);
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

/** Stamp one agent's routines doc, returning how many entries gained a
 *  creator. Exported for tests; production goes through
 *  {@link backfillRoutineCreatedBy}. */
export function backfillAgentRoutineCreatedBy(
  agentRoot: string,
  ownerSub: string,
): number {
  const path = join(agentRoot, ROUTINES_DOC);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return 0; // no routines doc — nothing to stamp
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return 0; // malformed doc: the read path reports it
  let stamped = 0;
  const next = parsed.map((entry) => {
    if (!isRecord(entry)) return entry;
    if (typeof entry.created_by === "string" && entry.created_by) return entry;
    stamped++;
    return { ...entry, created_by: ownerSub };
  });
  if (stamped === 0) return 0;
  // The canonical on-disk JSON document form (domain jsonDoc): pretty-printed,
  // trailing newline — byte-identical to what the next saveRoutines writes.
  writeAtomic(path, `${JSON.stringify(next, null, 2)}\n`);
  return stamped;
}

/**
 * Backfill every agent under the workspaces tree. Per-agent failures are
 * logged and skipped: one unreadable routines doc must never stop the host
 * from booting (same posture as the sibling migrations this runs beside).
 */
export function backfillRoutineCreatedBy(opts: {
  workspacesRoot: string;
  ownerSub: string;
  log?: (line: string) => void;
}): BackfillCreatedByResult {
  const log = opts.log ?? ((line: string) => console.log(line));
  const result: BackfillCreatedByResult = {
    updatedAgents: 0,
    updatedRoutines: 0,
  };
  for (const agentRoot of agentRoots(opts.workspacesRoot)) {
    try {
      const stamped = backfillAgentRoutineCreatedBy(agentRoot, opts.ownerSub);
      if (stamped > 0) {
        result.updatedAgents++;
        result.updatedRoutines += stamped;
        log(`[routine-created-by] ${agentRoot}: stamped ${stamped} routine(s)`);
      }
    } catch (err) {
      // Boot-time background path with no UI thread to toast on; the
      // sanctioned console.error boundary (same as the sibling migrations).
      console.error(`[routine-created-by] ${agentRoot}: backfill failed:`, err);
    }
  }
  return result;
}
