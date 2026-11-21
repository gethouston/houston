import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";

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
