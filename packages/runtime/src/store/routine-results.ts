import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";

/**
 * Where a routine chat's earlier replies are kept for the agent to read
 * (session/routine-digest.ts). Inside the conversation's session dir so it
 * hydrates with that conversation only (turn/turn-hot-set.ts) and goes when
 * its native sessions are cleared; every fresh routine session rewrites it.
 */
export const ROUTINE_RESULTS_FILE = "routine-results.md";

export function routineResultsPath(
  dataDir: string,
  conversationId: string,
): string {
  return join(dataDir, "sessions", conversationId, ROUTINE_RESULTS_FILE);
}

export function writeRoutineResultsAt(
  dataDir: string,
  conversationId: string,
  text: string,
): string {
  const path = routineResultsPath(dataDir, conversationId);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = atomicTempPath(path);
  writeFileSync(tmp, text);
  renameSync(tmp, path);
  return path;
}
