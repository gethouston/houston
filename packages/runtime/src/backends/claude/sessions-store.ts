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
import { claudeBaseDir, claudeProjectsDir, claudeSessionsFile } from "./paths";

/**
 * The conversationId → Claude Agent SDK `session_id` map, persisted so a fresh
 * runtime process (a desktop restart, a cloud sandbox woken from sleep) resumes
 * each conversation's SDK session instead of silently starting over. Stored at
 * `<dataDir>/backends/claude/sessions.json`, written atomically with mode 0600
 * (same discipline as `auth/auth-file.ts`) since it sits beside credential data.
 *
 * The SDK writes each session's transcript JSONL under the isolated config dir
 * (`<dataDir>/backends/claude/config/projects/<project>/<session_id>.jsonl`). If
 * that transcript is gone (config dir wiped) a resume would fail, so
 * `resolveResume` verifies the transcript exists by its known filename — no
 * fragile reconstruction of the SDK's project-slug scheme — and drops the dangling
 * mapping so we neither resume into nothing nor warn on every subsequent turn.
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

export function createSessionsStore(dataDir: string): SessionsStore {
  const baseDir = claudeBaseDir(dataDir);
  const filePath = claudeSessionsFile(dataDir);
  const projectsDir = claudeProjectsDir(dataDir);

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
      if (transcriptExists(projectsDir, sessionId)) return sessionId;
      console.warn(
        `[claude] transcript for conversation ${conversationId} (session ${sessionId}) is missing; starting a fresh session`,
      );
      remove(conversationId);
      return undefined;
    },
  };
}

/** Whether a `<sessionId>.jsonl` transcript exists anywhere under `projectsDir`. */
function transcriptExists(projectsDir: string, sessionId: string): boolean {
  if (!existsSync(projectsDir)) return false;
  const file = `${sessionId}.jsonl`;
  if (existsSync(join(projectsDir, file))) return true;
  for (const entry of readdirSync(projectsDir)) {
    if (existsSync(join(projectsDir, entry, file))) return true;
  }
  return false;
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
