import type { ConversationEntry } from "@houston/engine-adapter";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export interface ChatIdMap {
  activity: Map<string, string>;
  session: Map<string, string>;
  routine: Map<string, string>;
}

export const ACTIVITY_PATH = ".houston/activity/activity.json";
const TRANSCRIPT_PREFIX = ".houston/runtime/conversations/";

export function transcriptPath(sessionKey: string): string {
  return `${TRANSCRIPT_PREFIX}${encodeURIComponent(sessionKey)}.json`;
}

function nextSessionKey(
  key: string,
  nextId: string,
  routines: ReadonlyMap<string, string>,
): string {
  if (key.startsWith("activity-")) return `activity-${nextId}`;
  if (key.startsWith("routine-")) {
    for (const [from, to] of routines) {
      if (key === `routine-${from}` || key.startsWith(`routine-${from}-`)) {
        return `routine-${to}${key.slice(`routine-${from}`.length)}`;
      }
    }
  }
  return key;
}

export function planChatIdMap(
  conversations: readonly Pick<ConversationEntry, "id" | "session_key">[],
  mint: () => string,
  routineIds: Readonly<Record<string, string>> = {},
): ChatIdMap {
  const map: ChatIdMap = {
    activity: new Map(),
    session: new Map(),
    routine: new Map(Object.entries(routineIds)),
  };
  for (const c of conversations) {
    if (map.activity.has(c.id)) continue;
    const next = mint();
    map.activity.set(c.id, next);
    map.session.set(
      c.session_key,
      nextSessionKey(c.session_key, next, map.routine),
    );
  }
  return map;
}

interface ActivityRow {
  id: string;
  status?: string;
  session_key?: string;
  origin_session_key?: string;
  routine_id?: string;
  claude_session_id?: unknown;
  routine_run_id?: unknown;
  worktree_path?: unknown;
  [key: string]: unknown;
}

function remapActivities(text: string, map: ChatIdMap, mint: () => string) {
  const rows = JSON.parse(text) as ActivityRow[];
  if (!Array.isArray(rows)) return text;
  const out = rows.map((row) => {
    let id = map.activity.get(row.id);
    if (!id) {
      id = mint();
      map.activity.set(row.id, id);
      const key = row.session_key ?? `activity-${row.id}`;
      map.session.set(key, nextSessionKey(key, id, map.routine));
    }
    const {
      claude_session_id: _native,
      routine_run_id: _run,
      worktree_path: _tree,
      ...kept
    } = row;
    const next: ActivityRow = {
      ...kept,
      id,
      ...(row.status === "running" ? { status: "needs_you" } : {}),
    };
    if (row.session_key !== undefined) {
      next.session_key =
        map.session.get(row.session_key) ??
        nextSessionKey(row.session_key, id, map.routine);
    }
    if (row.routine_id !== undefined) {
      next.routine_id = map.routine.get(row.routine_id) ?? row.routine_id;
    }
    if (row.origin_session_key !== undefined) {
      const origin = map.session.get(row.origin_session_key);
      if (origin) next.origin_session_key = origin;
    }
    return next;
  });
  return JSON.stringify(out, null, 2);
}

function remapTranscript(rel: string, text: string, map: ChatIdMap) {
  const key = decodeURIComponent(
    rel.slice(TRANSCRIPT_PREFIX.length, -".json".length),
  );
  const next = map.session.get(key) ?? key;
  const doc = JSON.parse(text) as { id?: string };
  return {
    rel: transcriptPath(next),
    text: JSON.stringify({ ...doc, id: next, needsSessionReplay: true }),
  };
}

export function remapChatArchive(
  zip: Uint8Array,
  map: ChatIdMap,
  mint: () => string,
): Uint8Array {
  const entries = unzipSync(zip);
  const out: Record<string, Uint8Array> = {};
  for (const [rel, bytes] of Object.entries(entries)) {
    if (rel === ACTIVITY_PATH) {
      out[rel] = strToU8(remapActivities(strFromU8(bytes), map, mint));
    } else if (rel.startsWith(TRANSCRIPT_PREFIX) && rel.endsWith(".json")) {
      const next = remapTranscript(rel, strFromU8(bytes), map);
      out[next.rel] = strToU8(next.text);
    } else {
      out[rel] = bytes;
    }
  }
  return zipSync(out);
}
