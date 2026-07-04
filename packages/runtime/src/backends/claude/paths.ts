import { join } from "node:path";

/**
 * The on-disk layout for the Claude Agent SDK backend, in ONE place so every
 * caller agrees. The backend, the one-shot title path, the sessions store, and
 * dispose-cleanup all point the SDK at the SAME isolated `CLAUDE_CONFIG_DIR`; if
 * any of them computed it independently and drifted, resume would read a
 * different config dir than the one turns wrote (transcripts "missing", sessions
 * silently restarting). Rooted under `dataDir` so nothing on the host leaks in.
 */
export function claudeBaseDir(dataDir: string): string {
  return join(dataDir, "backends", "claude");
}

/** The isolated SDK config dir (`CLAUDE_CONFIG_DIR`) for this workspace. */
export function claudeConfigDir(dataDir: string): string {
  return join(claudeBaseDir(dataDir), "config");
}

/** Where the SDK writes per-session transcripts (`<config>/projects`). */
export function claudeProjectsDir(dataDir: string): string {
  return join(claudeConfigDir(dataDir), "projects");
}

/** The conversationId → SDK session_id map file. */
export function claudeSessionsFile(dataDir: string): string {
  return join(claudeBaseDir(dataDir), "sessions.json");
}
