import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import { agentRoots } from "./chat-history";

export interface BackfillCreatedByResult {
  updatedAgents: number;
  updatedRoutines: number;
}

const ROUTINES_DOC = join(".houston", "routines", "routines.json");

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = atomicTempPath(
    join(dirname(path), `.${Date.now()}-${Math.random()}`),
  );
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

export function backfillAgentRoutineCreatedBy(
  agentRoot: string,
  ownerSub: string,
): number {
  const path = join(agentRoot, ROUTINES_DOC);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return 0;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return 0;
  let stamped = 0;
  const next = parsed.map((entry) => {
    if (!isRecord(entry)) return entry;
    if (typeof entry.created_by === "string" && entry.created_by) return entry;
    stamped++;
    return { ...entry, created_by: ownerSub };
  });
  if (stamped === 0) return 0;
  writeAtomic(path, `${JSON.stringify(next, null, 2)}\n`);
  return stamped;
}

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
      console.error(`[routine-created-by] ${agentRoot}: backfill failed:`, err);
    }
  }
  return result;
}
