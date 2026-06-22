import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Agent linkage for the chat-history migration (verified against the real
 * reference dataset): activities do NOT carry the session id. The link is the
 * session-id-tracker files the Rust CLI wrote at
 * `<agentRoot>/.houston/sessions/<provider>/<session_key>.sid` (+ `.history`),
 * where `session_key` = the conversation id (e.g. `activity-<uuid>`) and the file
 * content IS one or more `chat_feed.claude_session_id`s.
 *
 * A conversation can span the `anthropic/` and `openai/` provider dirs and
 * several `.history` rotations, so we UNION every id found for a key.
 */

const SESSIONS_REL = join(".houston", "sessions");

/** Read one tracker file's ids: `.sid` = a single id (no trailing newline);
 * `.history` = one id per line (rotations). Trim each, drop blanks. */
function idsFromTrackerFile(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * For one agent, map every `session_key` to the UNION of its claude_session_ids,
 * gathered across both provider subdirs and across `.sid` + `.history` files. The
 * key is the tracker filename without its extension (`activity-<uuid>`,
 * `routine-<uuid>`, ...) — it becomes the conversation id, so an existing board
 * card links straight to the migrated transcript.
 */
export function sessionGroupsForAgent(
  agentRoot: string,
): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  const sessionsDir = join(agentRoot, SESSIONS_REL);
  if (!existsSync(sessionsDir)) return groups;

  for (const provider of readdirSync(sessionsDir)) {
    const providerDir = join(sessionsDir, provider);
    let entries: string[];
    try {
      entries = readdirSync(providerDir);
    } catch {
      continue; // not a directory (stray file) — skip
    }
    for (const entry of entries) {
      const ext = entry.endsWith(".sid")
        ? ".sid"
        : entry.endsWith(".history")
          ? ".history"
          : null;
      if (!ext) continue;
      const sessionKey = entry.slice(0, -ext.length);
      let set = groups.get(sessionKey);
      if (!set) {
        set = new Set<string>();
        groups.set(sessionKey, set);
      }
      for (const id of idsFromTrackerFile(join(providerDir, entry)))
        set.add(id);
    }
  }
  return groups;
}
