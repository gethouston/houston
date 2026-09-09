import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/**
 * The "turn in flight" marker: one small file per conversation, written the
 * moment a turn is accepted and removed when it ends — by ANY path (clean
 * done, provider error, user stop, a thrown turn). A marker that survives into
 * the next boot is therefore the one trace of a turn the previous process died
 * on: a pod OOM-killed mid-turn (one cgroup, group kill, SIGKILL leaves no
 * process to report), the desktop force-quit. The boot settle
 * (settle-interrupted-turns.ts) reads survivors, writes the honest reply the
 * dead process never could, and reports the restart — the only way the fleet
 * count of these ever reaches Sentry.
 *
 * Lives under the runtime's data dir, beside `conversations/`, so the managed
 * pod's store sync carries it to the object store with the transcript: a
 * marker that never left the pod would die with it and there would be nothing
 * to find. Own directory rather than a sibling of the conversation file: the
 * conversation lister treats every `*.json` under `conversations/` as a
 * transcript.
 */

export interface InflightTurnMarker {
  conversationId: string;
  turnId: string;
  /** Epoch ms the turn was accepted (the user message persisted). */
  startedAt: number;
  /** The tool running when the marker was last updated, when one started. */
  tool?: string;
  /**
   * Whether model-spawned processes ran under the child memory fence
   * (child-memory-fence.ts). A survivor with a running bash tool AND the fence
   * up is a kill the fence should have prevented — the report names it.
   */
  fenced: boolean;
}

export const INFLIGHT_DIR = join("turns", "inflight");

export function inflightDir(dataDir: string): string {
  return join(dataDir, INFLIGHT_DIR);
}

const fileFor = (dataDir: string, conversationId: string) =>
  join(inflightDir(dataDir), `${encodeURIComponent(conversationId)}.json`);

/** Write (or replace) the marker for `marker.conversationId`. Atomic swap. */
export function writeInflightMarker(
  dataDir: string,
  marker: InflightTurnMarker,
): void {
  const dir = inflightDir(dataDir);
  mkdirSync(dir, { recursive: true });
  const file = fileFor(dataDir, marker.conversationId);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(marker));
  renameSync(tmp, file);
}

/**
 * Record the tool that just started on the running turn. A marker that is
 * gone (the turn ended between the frame and this write) is left gone: the
 * update must never resurrect a settled turn as in-flight.
 */
export function noteInflightTool(
  dataDir: string,
  conversationId: string,
  tool: string,
): void {
  const current = readInflightMarker(dataDir, conversationId);
  if (!current) return;
  writeInflightMarker(dataDir, { ...current, tool });
}

export function clearInflightMarker(
  dataDir: string,
  conversationId: string,
): void {
  rmSync(fileFor(dataDir, conversationId), { force: true });
}

export function readInflightMarker(
  dataDir: string,
  conversationId: string,
): InflightTurnMarker | null {
  return parseMarker(readOrNull(fileFor(dataDir, conversationId)));
}

/**
 * Every marker on disk — at boot, every one of them is a turn the previous
 * process died on. A file that does not parse as a marker is dropped from the
 * listing AND from disk: it can never be settled, and leaving it would make
 * every boot re-report the same junk.
 */
export function listInflightMarkers(dataDir: string): InflightTurnMarker[] {
  const dir = inflightDir(dataDir);
  if (!existsSync(dir)) return [];
  const out: InflightTurnMarker[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const file = join(dir, name);
    const marker = parseMarker(readOrNull(file));
    if (marker) out.push(marker);
    else rmSync(file, { force: true });
  }
  return out;
}

function parseMarker(raw: string | null): InflightTurnMarker | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const m = value as Partial<InflightTurnMarker>;
  if (
    typeof m.conversationId !== "string" ||
    typeof m.turnId !== "string" ||
    typeof m.startedAt !== "number"
  )
    return null;
  return {
    conversationId: m.conversationId,
    turnId: m.turnId,
    startedAt: m.startedAt,
    ...(typeof m.tool === "string" ? { tool: m.tool } : {}),
    fenced: m.fenced === true,
  };
}

function readOrNull(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
