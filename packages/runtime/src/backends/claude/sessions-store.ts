import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

// NOTE on isolation: `sessions.json` (the conversationId → session_id map) lives
// per-agent under `dataDir`, but the transcript `projects` tree is SHARED (it
// sits under `CLAUDE_CONFIG_DIR` = `claudeLoginConfigDir()`, where the SDK
// actually writes). Each agent's transcripts land in their own cwd-slug subdir
// and every session_id is globally unique, so the per-conversation lookups below
// (keyed by session_id filename) never cross agents.

/**
 * The conversationId → Claude Agent SDK `session_id` map, persisted so a fresh
 * runtime process (a desktop restart, a cloud sandbox woken from sleep) resumes
 * each conversation's SDK session instead of silently starting over. Stored at
 * `<dataDir>/backends/claude/sessions.json`, written atomically with mode 0600
 * (same discipline as `auth/auth-file.ts`) since it sits beside credential data.
 *
 * The SDK writes each session's transcript JSONL under the SHARED config dir
 * (`<claudeLoginConfigDir>/projects/<cwd-slug>/<session_id>.jsonl`), and its
 * `resume` looks the id up ONLY under the CURRENT cwd's slug. So
 * `resolveResume` locates the transcript by its known filename and, when it
 * sits under another slug dir (the agent was renamed, which moved the
 * workspace cwd — HOU-892), RELOCATES it into the current cwd's slug dir so
 * the SDK resumes the conversation with its context intact. A transcript
 * that is gone entirely (config dir wiped), or that cannot be relocated,
 * drops the dangling mapping so we neither resume into nothing nor warn on
 * every subsequent turn — the session then starts fresh.
 */
export interface SessionsStore {
  /** The stored SDK session id for a conversation, if any. */
  getSessionId(conversationId: string): string | undefined;
  /** Persist the SDK session id captured from a turn's system/init. */
  setSessionId(conversationId: string, sessionId: string): void;
  /** Forget a conversation's mapping (leaves the transcript on disk). */
  remove(conversationId: string): void;
  /**
   * Fully drop a conversation's SDK state on delete: its mapping AND its
   * transcript JSONL under the config dir's projects tree. Idempotent, and a
   * no-op for a conversation that never ran on this backend (no mapping). Called
   * from `disposeConversation` so a deleted anthropic chat leaves nothing behind.
   */
  purge(conversationId: string): void;
  /** The session id to resume, or undefined when none / its transcript is gone. */
  resolveResume(conversationId: string): string | undefined;
}

/**
 * @param cwd The agent's working directory (the SDK session cwd). When given,
 * `resolveResume` can relocate a transcript stranded under a stale cwd slug;
 * without it (e.g. the purge-only cleanup path) relocation is skipped.
 */
export function createSessionsStore(input: {
  configDir: string;
  sessionsFile: string;
  cwd?: string;
}): SessionsStore {
  const baseDir = dirname(input.sessionsFile);
  const filePath = input.sessionsFile;
  const projectsDir = join(input.configDir, "projects");
  const { cwd } = input;
  const currentSlugDir = cwd
    ? join(projectsDir, sdkProjectSlug(cwd))
    : undefined;

  function read(): Record<string, string> {
    if (!existsSync(filePath)) return {};
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function write(map: Record<string, string>): void {
    mkdirSync(baseDir, { recursive: true });
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(map), { mode: 0o600 }); // atomic write
    renameSync(tmp, filePath);
  }

  function remove(conversationId: string): void {
    const map = read();
    if (!(conversationId in map)) return;
    delete map[conversationId];
    write(map);
  }

  function purge(conversationId: string): void {
    const sessionId = read()[conversationId];
    if (sessionId) removeTranscript(projectsDir, sessionId);
    remove(conversationId);
  }

  return {
    getSessionId(conversationId) {
      return read()[conversationId];
    },
    setSessionId(conversationId, sessionId) {
      const map = read();
      if (map[conversationId] === sessionId) return;
      map[conversationId] = sessionId;
      write(map);
    },
    remove,
    purge,
    resolveResume(conversationId) {
      const sessionId = read()[conversationId];
      if (!sessionId) return undefined;
      const located = locateTranscript(projectsDir, sessionId);
      if (!located) {
        console.warn(
          `[claude] transcript for conversation ${conversationId} (session ${sessionId}) is missing; starting a fresh session`,
        );
        remove(conversationId);
        return undefined;
      }
      // The SDK resolves `resume` only under the CURRENT cwd's slug dir. A
      // transcript that sits anywhere else (the agent was renamed → new cwd →
      // new slug) is moved home so the conversation continues with its
      // context, instead of the SDK rejecting the id.
      if (currentSlugDir && dirname(located) !== currentSlugDir) {
        try {
          mkdirSync(currentSlugDir, { recursive: true });
          renameSync(located, join(currentSlugDir, `${sessionId}.jsonl`));
          console.warn(
            `[claude] relocated transcript for conversation ${conversationId} (session ${sessionId}) to the current workspace slug`,
          );
        } catch (err) {
          console.warn(
            `[claude] could not relocate transcript for conversation ${conversationId} (session ${sessionId}); starting a fresh session`,
            err,
          );
          remove(conversationId);
          return undefined;
        }
      }
      return sessionId;
    },
  };
}

/**
 * The SDK's project-slug scheme: the session cwd with every non-alphanumeric
 * character replaced by `-` (verified against the dirs the SDK writes, e.g.
 * `/Users/x/.h/ws/Agent 3` → `-Users-x--h-ws-Agent-3`). If the SDK ever
 * changes the scheme, relocation targets a dir it ignores and resume fails —
 * which the session-level fresh-retry (session.ts) then absorbs, so drift
 * degrades to today's start-fresh behavior, never a wedge.
 */
function sdkProjectSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

/** The full path of a `<sessionId>.jsonl` transcript under `projectsDir`, if any. */
function locateTranscript(
  projectsDir: string,
  sessionId: string,
): string | undefined {
  if (!existsSync(projectsDir)) return undefined;
  const file = `${sessionId}.jsonl`;
  const top = join(projectsDir, file);
  const candidates = existsSync(top) ? [top] : [];
  for (const entry of readdirSync(projectsDir)) {
    const nested = join(projectsDir, entry, file);
    if (existsSync(nested)) candidates.push(nested);
  }
  return candidates
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .sort(
      (left, right) =>
        right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path),
    )[0]?.path;
}

/**
 * Delete a session's `<sessionId>.jsonl` transcript wherever it sits under
 * `projectsDir` (top level or inside a project-slug subdir) — the delete-side
 * mirror of `transcriptExists`, so both share one view of the SDK's layout
 * instead of chat.ts reconstructing the project-slug scheme.
 */
function removeTranscript(projectsDir: string, sessionId: string): void {
  if (!existsSync(projectsDir)) return;
  const file = `${sessionId}.jsonl`;
  rmSync(join(projectsDir, file), { force: true });
  for (const entry of readdirSync(projectsDir)) {
    rmSync(join(projectsDir, entry, file), { force: true });
  }
}
