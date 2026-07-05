import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { sessionGroupsForAgent } from "./linkage";
import { messageFor, reconstruct, rowTs, titleFor } from "./reconstruct";
import { Database } from "./sqlite";
import type { ChatFeedRow, SessionPair, StoredConversation } from "./types";

/**
 * One-time migration of the Rust-desktop era's chat history into the v3
 * (single-engine host) layout. The Rust app stored chat OUTSIDE the agent tree,
 * in `~/.houston/db/houston.db` (`chat_feed`); the host stores it INSIDE the
 * tree, per agent, under `.houston/runtime/`.
 *
 * Strictly additive + idempotent: we only WRITE new files under
 * `<agentRoot>/.houston/runtime/`. We NEVER modify, lock, or delete the source
 * db or any existing tree file. The db is opened READ-ONLY. A per-agent
 * `.migrated` marker plus a per-conversation existence check make re-runs no-ops.
 *
 * Linkage (verified, see linkage.ts): the `.sid`/`.history` tracker files per
 * agent map a `session_key` (= conversation id) to its `claude_session_id`s.
 * Reconstruction (see reconstruct.ts): the full feed → transcript, user/assistant
 * text → the synthesized pi session (the agent's memory).
 */

const RUNTIME_REL = join(".houston", "runtime");
const MARKER_NAME = ".migrated";

// ---------------------------------------------------------------------------
// Results + options.
// ---------------------------------------------------------------------------

export interface MigrateAgentResult {
  agentRoot: string;
  /** Conversations newly written this run (existing ones are skipped). */
  migrated: number;
  /** Conversations already present (idempotent skip). */
  skipped: number;
  /** Whether the agent was skipped wholesale via its `.migrated` marker. */
  alreadyMarked: boolean;
}

export interface MigrateResult {
  agents: MigrateAgentResult[];
  /** Total conversations newly written across all agents. */
  totalMigrated: number;
  /** Total conversations already present across all agents. */
  totalSkipped: number;
  /**
   * `chat_feed` conversations (distinct claude_session_ids) that no tracker file
   * references — deleted activities whose rows persisted. Counted + logged, never
   * migrated (there is no agent column to place them on) and never silently
   * dropped.
   */
  orphanSessionIds: number;
}

export interface MigrateChatHistoryOptions {
  /** `~/.houston/workspaces` (or a copy) — the desktop tree root. */
  workspacesRoot: string;
  /**
   * Path to the Rust `chat_feed` db. The db is opened read-only and never
   * written. For a test against live data, copy the file (and its `-wal`/`-shm`
   * sidecars, since the live db is WAL-mode) to a scratch dir first.
   */
  dbPath: string;
  /** Optional log sink; defaults to console.log. Receives one line per call. */
  log?: (line: string) => void;
}

// ---------------------------------------------------------------------------
// Transcript + session writers.
// ---------------------------------------------------------------------------

function writeTranscript(dir: string, conv: StoredConversation): void {
  mkdirSync(dir, { recursive: true });
  const f = join(dir, `${encodeURIComponent(conv.id)}.json`);
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(conv));
  renameSync(tmp, f); // atomic swap; never leaves a half-written file
}

/**
 * Append the user/assistant text pairs to a pi session via SessionManager, so a
 * later `continueRecent()` rehydrates them into the agent's context. We import
 * SessionManager DIRECTLY from @earendil-works/pi-coding-agent (already a
 * dependency of this host — the same package the runtime uses), so there is no
 * need to depend on @houston/runtime.
 *
 * pi persists a session only once it holds an assistant message, so we only
 * synthesize a session when at least one non-empty assistant turn exists.
 */
function synthesizeSession(
  workspaceDir: string,
  sessionDir: string,
  pairs: SessionPair[],
): void {
  const hasAssistant = pairs.some(
    (p) => p.role === "assistant" && p.content.length > 0,
  );
  if (!hasAssistant) return;

  const mgr = SessionManager.create(workspaceDir, sessionDir);
  for (const p of pairs) {
    if (!p.content) continue;
    mgr.appendMessage(messageFor(p));
  }
}

// ---------------------------------------------------------------------------
// Per-agent migration.
// ---------------------------------------------------------------------------

/**
 * Migrate one agent's chat history. `agentRoot` is the agent's on-disk root; pi
 * sessions are anchored there so the rehydrated context has the right cwd.
 * Returns counts; pure of process state beyond file writes.
 *
 * `referenced` (optional) accumulates every claude_session_id this agent claims,
 * so the caller can compute the orphan set.
 */
export function migrateAgentChatHistory(
  agentRoot: string,
  db: Database,
  log: (line: string) => void,
  referenced?: Set<string>,
): MigrateAgentResult {
  const runtimeDir = join(agentRoot, RUNTIME_REL);
  const conversationsDir = join(runtimeDir, "conversations");
  const sessionsOutDir = join(runtimeDir, "sessions");
  const marker = join(runtimeDir, MARKER_NAME);

  const groups = sessionGroupsForAgent(agentRoot);
  if (referenced)
    for (const set of groups.values()) for (const id of set) referenced.add(id);

  if (existsSync(marker)) {
    return {
      agentRoot,
      migrated: 0,
      skipped: groups.size,
      alreadyMarked: true,
    };
  }

  // One reusable statement for all of this agent's ids.
  const stmt = db.query<ChatFeedRow, [string]>(
    "SELECT id, claude_session_id, feed_type, data_json, timestamp FROM chat_feed WHERE claude_session_id = ?",
  );

  let migrated = 0;
  let skipped = 0;

  for (const [sessionKey, ids] of groups) {
    const transcriptFile = join(
      conversationsDir,
      `${encodeURIComponent(sessionKey)}.json`,
    );
    if (existsSync(transcriptFile)) {
      skipped++;
      continue; // idempotent: this conversation is already migrated
    }

    // Pull + merge every row across the key's session ids, ordered by timestamp
    // then id (a conversation can span several ids — e.g. anthropic + openai).
    const rows: ChatFeedRow[] = [];
    for (const id of ids) rows.push(...stmt.all(id));
    if (rows.length === 0) continue; // a tracker file with no surviving rows
    rows.sort((a, b) => rowTs(a) - rowTs(b) || a.id - b.id);

    const { transcript, sessionPairs } = reconstruct(rows);
    if (transcript.length === 0) continue;

    const tsList = transcript.map((m) => m.ts).filter((t) => t > 0);
    const createdAt = tsList.length ? Math.min(...tsList) : Date.now();
    const updatedAt = tsList.length ? Math.max(...tsList) : createdAt;

    writeTranscript(conversationsDir, {
      id: sessionKey,
      title: titleFor(transcript),
      createdAt,
      updatedAt,
      messages: transcript,
    });

    synthesizeSession(
      agentRoot,
      join(sessionsOutDir, sessionKey),
      sessionPairs,
    );
    migrated++;
  }

  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(marker, new Date().toISOString());
  log(`[migrate:chat] ${agentRoot}: migrated ${migrated}, skipped ${skipped}`);
  return { agentRoot, migrated, skipped, alreadyMarked: false };
}

// ---------------------------------------------------------------------------
// Whole-tree migration.
// ---------------------------------------------------------------------------

/** Every agent dir under the tree: `<root>/<Workspace>/<Agent>`. Dot-dirs and
 * non-directories are skipped, mirroring LocalWorkspaceStore. Shared with the
 * flat-layout migration (agent-layout.ts). */
export function agentRoots(workspacesRoot: string): string[] {
  if (!existsSync(workspacesRoot)) return [];
  const out: string[] = [];
  const isDir = (p: string) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  for (const ws of readdirSync(workspacesRoot)) {
    if (ws.startsWith(".")) continue;
    const wsDir = join(workspacesRoot, ws);
    if (!isDir(wsDir)) continue;
    for (const agent of readdirSync(wsDir)) {
      if (agent.startsWith(".")) continue;
      const agentDir = join(wsDir, agent);
      if (isDir(agentDir)) out.push(agentDir);
    }
  }
  return out;
}

/**
 * Migrate the whole desktop tree. Guarded on the db existing (the caller skips
 * the call entirely otherwise). Opens the db READ-ONLY so we can never lock or
 * mutate it.
 */
export function migrateChatHistory(
  opts: MigrateChatHistoryOptions,
): MigrateResult {
  const log = opts.log ?? ((l: string) => console.log(l));

  const db = new Database(opts.dbPath, { readonly: true });
  try {
    const referenced = new Set<string>();
    const agents: MigrateAgentResult[] = [];
    for (const agentRoot of agentRoots(opts.workspacesRoot)) {
      agents.push(migrateAgentChatHistory(agentRoot, db, log, referenced));
    }

    // Orphans: chat_feed conversations no tracker file references.
    const allIds = db
      .query<{ claude_session_id: string }, []>(
        "SELECT DISTINCT claude_session_id FROM chat_feed",
      )
      .all()
      .map((r) => r.claude_session_id);
    const orphanSessionIds = allIds.filter((id) => !referenced.has(id)).length;
    if (orphanSessionIds > 0) {
      log(
        `[migrate:chat] ${orphanSessionIds} orphan conversation(s) with no session tracker file — logged, not migrated (no agent to place them on)`,
      );
    }

    const totalMigrated = agents.reduce((n, a) => n + a.migrated, 0);
    const totalSkipped = agents.reduce((n, a) => n + a.skipped, 0);
    log(
      `[migrate:chat] done: ${totalMigrated} migrated, ${totalSkipped} already present, ${orphanSessionIds} orphans across ${agents.length} agent(s)`,
    );
    return { agents, totalMigrated, totalSkipped, orphanSessionIds };
  } finally {
    db.close();
  }
}
