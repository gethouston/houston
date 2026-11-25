import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { atomicTempPath } from "@houston/protocol";
import { listAgentDirs } from "../store/local-dirs";
import { sessionGroupsForAgent } from "./linkage";
import {
  importedHistoryNote,
  messageFor,
  reconstruct,
  rowTs,
  titleFor,
} from "./reconstruct";
import { Database } from "./sqlite";
import type { ChatFeedRow, SessionPair, StoredConversation } from "./types";

const RUNTIME_REL = join(".houston", "runtime");

export interface MigrateAgentResult {
  agentRoot: string;
  migrated: number;
  skipped: number;
}

export interface MigrateResult {
  agents: MigrateAgentResult[];
  totalMigrated: number;
  totalSkipped: number;
  orphanSessionIds: number;
}

export interface MigrateChatHistoryOptions {
  workspacesRoot: string;
  dbPath: string;
  log?: (line: string) => void;
}

function writeTranscript(dir: string, conv: StoredConversation): void {
  mkdirSync(dir, { recursive: true });
  const f = join(dir, `${encodeURIComponent(conv.id)}.json`);
  const tmp = atomicTempPath(f);
  writeFileSync(tmp, JSON.stringify(conv));
  renameSync(tmp, f);
}

// WHY: pi persists a session only once it holds an assistant message. ADR-0016
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
  let lastTs = 0;
  for (const p of pairs) {
    if (!p.content) continue;
    mgr.appendMessage(messageFor(p));
    if (p.ts > lastTs) lastTs = p.ts;
  }
  mgr.appendMessage(importedHistoryNote(lastTs));
}

export function migrateAgentChatHistory(
  agentRoot: string,
  db: Database,
  log: (line: string) => void,
  referenced?: Set<string>,
): MigrateAgentResult {
  const runtimeDir = join(agentRoot, RUNTIME_REL);
  const conversationsDir = join(runtimeDir, "conversations");
  const sessionsOutDir = join(runtimeDir, "sessions");

  const groups = sessionGroupsForAgent(agentRoot);
  if (referenced)
    for (const set of groups.values()) for (const id of set) referenced.add(id);

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
      continue;
    }

    const rows: ChatFeedRow[] = [];
    for (const id of ids) rows.push(...stmt.all(id));
    if (rows.length === 0) continue;
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

  if (migrated > 0) {
    log(
      `[migrate:chat] ${agentRoot}: migrated ${migrated}, skipped ${skipped}`,
    );
  }
  return { agentRoot, migrated, skipped };
}

export function agentRoots(workspacesRoot: string): string[] {
  return listAgentDirs(workspacesRoot);
}

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
