import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The on-disk layout for the Claude Agent SDK backend, in ONE place so every
 * caller agrees.
 *
 * There are TWO distinct roots, deliberately split:
 *
 *  - The CREDENTIAL + SDK config dir (`claudeLoginConfigDir`) is WORKSPACE-SHARED
 *    (rooted at `HOUSTON_HOME`, NOT the per-agent `dataDir`). It is the SDK's
 *    `CLAUDE_CONFIG_DIR`, and it is where the desktop `claude auth login` caches
 *    the credential. Login and every agent's SDK backend point at the SAME dir so
 *    they see each other's credential (macOS scopes the Keychain item by this dir,
 *    Linux writes `<dir>/.credentials.json` in it). One login connects every agent.
 *
 *  - The per-agent bookkeeping (`claudeBaseDir` / `claudeSessionsFile`) stays
 *    under the agent's `dataDir`. It holds only Houston's own conversationId →
 *    SDK session_id map, which is keyed by per-agent conversation ids.
 *
 * The SDK writes each conversation's transcript under
 * `<claudeLoginConfigDir>/projects/<cwd-slug>/<session_id>.jsonl`. Because the
 * slug derives from the agent's working directory (each agent has its OWN cwd)
 * and session_ids are globally unique, agents sharing the one config dir never
 * collide — see `claudeProjectsDir`.
 */

/** Houston's data root (`HOUSTON_HOME`), matching `config.ts`'s dataDir base. */
export function houstonHome(): string {
  return process.env.HOUSTON_HOME || join(homedir(), ".houston-ts");
}

/**
 * The SHARED credential + SDK config dir (`CLAUDE_CONFIG_DIR`) used by BOTH the
 * desktop `claude auth login` and the anthropic SDK backend. Rooted at
 * `HOUSTON_HOME` so it is stable across every agent's runtime process, and so the
 * Tauri shell (which derives `houston_dir()/claude-login` independently) computes
 * the identical path. The `home` arg is injectable for tests.
 */
export function claudeLoginConfigDir(home: string = houstonHome()): string {
  return join(home, "claude-login");
}

/**
 * Where the SDK writes per-session transcripts: `<CLAUDE_CONFIG_DIR>/projects`.
 * SHARED (under the login config dir, where the SDK actually writes), but each
 * agent's transcripts land in their own cwd-slug subdir, so the sessions store's
 * per-conversation lookups never cross agents.
 */
export function claudeProjectsDir(): string {
  return join(claudeLoginConfigDir(), "projects");
}

/**
 * Per-agent bookkeeping root under the agent's `dataDir` — holds only the
 * conversationId → SDK session_id map (`sessions.json`). NOT the SDK config dir.
 */
export function claudeBaseDir(dataDir: string): string {
  return join(dataDir, "backends", "claude");
}

/** The conversationId → SDK session_id map file (per agent). */
export function claudeSessionsFile(dataDir: string): string {
  return join(claudeBaseDir(dataDir), "sessions.json");
}
