import type { ConversationEntry } from "@houston-ai/engine-client";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * Copied chats get NEW ids. A task's id and its conversation key are global
 * in the app (the cross-agent sweep, the chat panel, notifications all look a
 * conversation up by key alone), so a verbatim copy would make the copy's
 * chats resolve to the SOURCE agent: the panel would show the source's
 * transcript while sends went to the copy. Pure; unit-tested in
 * `app/tests/copy-chat-remap.test.ts`.
 */

export interface ChatIdMap {
  /** Source task id → the copy's task id. */
  activity: Map<string, string>;
  /** Source conversation key → the copy's conversation key. */
  session: Map<string, string>;
}

/** The board file every task row lives in. */
export const ACTIVITY_PATH = ".houston/activity/activity.json";
const TRANSCRIPT_PREFIX = ".houston/runtime/conversations/";

/** The transcript file of one conversation, as the runtime names it. */
export function transcriptPath(sessionKey: string): string {
  return `${TRANSCRIPT_PREFIX}${encodeURIComponent(sessionKey)}.json`;
}

/** One fresh id per source conversation, decided once so every batch agrees. */
export function planChatIdMap(
  conversations: readonly Pick<ConversationEntry, "id" | "session_key">[],
  mint: () => string,
): ChatIdMap {
  const map: ChatIdMap = { activity: new Map(), session: new Map() };
  for (const c of conversations) {
    if (map.activity.has(c.id)) continue;
    const next = mint();
    map.activity.set(c.id, next);
    map.session.set(c.session_key, `activity-${next}`);
  }
  return map;
}

interface ActivityRow {
  id: string;
  session_key?: string;
  origin_session_key?: string;
  [key: string]: unknown;
}

function remapActivities(text: string, map: ChatIdMap, mint: () => string) {
  const rows = JSON.parse(text) as ActivityRow[];
  if (!Array.isArray(rows)) return text;
  const out = rows.map((row) => {
    // A task the conversation list did not name still gets a fresh id: its
    // transcript was not exported, but the id must not collide either.
    let id = map.activity.get(row.id);
    if (!id) {
      id = mint();
      map.activity.set(row.id, id);
      map.session.set(
        row.session_key ?? `activity-${row.id}`,
        `activity-${id}`,
      );
    }
    const next: ActivityRow = { ...row, id };
    if (row.session_key !== undefined) {
      next.session_key = map.session.get(row.session_key) ?? `activity-${id}`;
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
  const next = map.session.get(key);
  if (!next) return { rel, text };
  const doc = JSON.parse(text) as { id?: string };
  return {
    rel: transcriptPath(next),
    text: JSON.stringify({ ...doc, id: next }),
  };
}

/**
 * Rewrite one exported chats archive: the board file's task ids and keys,
 * and each transcript's file name and inner id. Entries the map does not
 * know pass through untouched.
 */
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
