import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import { currentConversationSessionDir } from "./conversation-context";

export const CODEX_REFUSALS_FILE = "codex-refusals.json";
export const RECONNECT_OFFERED_FILE = "reconnect-offered.json";

export const CONVERSATION_MARK_FILES: ReadonlySet<string> = new Set([
  CODEX_REFUSALS_FILE,
  RECONNECT_OFFERED_FILE,
]);

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function readConversationMark(name: string): unknown {
  const dir = currentConversationSessionDir();
  if (!dir) return undefined;
  const file = join(dir, name);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    if (!missing(error))
      console.warn(
        `[conversation-marks] could not read ${file}, ignoring it: ${error instanceof Error ? error.message : String(error)}`,
      );
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(
      `[conversation-marks] ${file} is not JSON, ignoring it: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

export function writeConversationMark(name: string, value: unknown): void {
  const dir = currentConversationSessionDir();
  if (!dir) return;
  const file = join(dir, name);
  try {
    mkdirSync(dir, { recursive: true });
    const tmp = atomicTempPath(file);
    writeFileSync(tmp, JSON.stringify(value));
    renameSync(tmp, file);
  } catch (error) {
    console.error(`[conversation-marks] could not record ${file}:`, error);
  }
}

export function clearSessionDirKeepingMarks(sessionDir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(sessionDir);
  } catch (error) {
    if (missing(error)) return;
    throw error;
  }
  for (const entry of entries) {
    if (CONVERSATION_MARK_FILES.has(entry)) continue;
    rmSync(join(sessionDir, entry), { recursive: true, force: true });
  }
}
