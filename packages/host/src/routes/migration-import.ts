import { existsSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { type AgentFileChangeEvent, agentFileEventType } from "@houston/domain";
import { unzipSync } from "fflate";
import { importedHistoryNote, messageFor } from "../migrate/reconstruct";
import type { StoredConversation } from "../migrate/types";
import type { Vfs } from "../vfs";
import { safeSeedKey } from "./agent-seed";
import {
  classifyMigrationPath,
  MAX_IMPORT_ENTRIES,
  MAX_IMPORT_UNPACKED_BYTES,
  MAX_MIGRATION_FILE_BYTES,
} from "./migration-scope";

/**
 * The TARGET side of the desktop→cloud migration import (HOU-719): unpack one
 * uploaded zip chunk into the agent root. Every entry is re-validated against
 * the shared migration allowlist — the body is client input arriving through
 * the gateway, so a hostile archive must never write `auth.json`, engine
 * internals, or anything outside the root. Skip-existing per entry makes a
 * re-POST of the same chunk an idempotent resume.
 */

export class MigrationImportError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MigrationImportError";
  }
}

export interface MigrationImportResult {
  written: number;
  skipped: number;
  rejected: { path: string; reason: string }[];
  /** False when this deployment has no on-disk agent dir to anchor sessions. */
  sessionsRebuilt: boolean;
}

/** Imported runtime transcripts surface as conversation reactivity, not Files. */
function migrationEventType(rel: string): AgentFileChangeEvent["type"] | null {
  if (rel.startsWith(".houston/runtime/")) return "ConversationsChanged";
  return agentFileEventType(rel);
}

/**
 * Re-synthesize the pi session for an imported transcript. Sessions are
 * cwd-anchored (`agentDir`), so the source machine's `.jsonl`s can't be
 * transplanted — rebuild the agent's memory from the transcript's user and
 * assistant text instead, exactly as the boot chat-history migration does.
 * pi persists a session only once it holds an assistant message.
 */
function synthesizeSessionFromTranscript(
  agentDir: string,
  conv: StoredConversation,
): void {
  // The id names the session dir on disk — refuse anything path-like.
  if (!conv.id || /[/\\]/.test(conv.id) || conv.id.includes("..")) return;
  const sessionDir = join(agentDir, ".houston", "runtime", "sessions", conv.id);
  if (existsSync(sessionDir)) return; // idempotent resume
  const pairs = conv.messages.filter(
    (m) => (m.role === "user" || m.role === "assistant") && m.content,
  );
  if (!pairs.some((m) => m.role === "assistant")) return;
  const mgr = SessionManager.create(agentDir, sessionDir);
  let lastTs = 0;
  for (const m of pairs) {
    mgr.appendMessage(
      messageFor({ role: m.role, content: m.content, ts: m.ts }),
    );
    if (m.ts > lastTs) lastTs = m.ts;
  }
  // Close the imported block so the next live turn treats it as a record, not
  // as pending instructions (see IMPORTED_HISTORY_NOTE for the incident).
  mgr.appendMessage(importedHistoryNote(lastTs));
}

export async function applyMigrationArchive(opts: {
  vfs: Vfs;
  root: string;
  /** Absolute on-disk agent dir (local profile / pod); anchors pi sessions. */
  agentDir?: string;
  bytes: Buffer;
  overwrite: boolean;
}): Promise<{
  result: MigrationImportResult;
  events: Set<AgentFileChangeEvent["type"]>;
}> {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(new Uint8Array(opts.bytes));
  } catch (err) {
    throw new MigrationImportError(
      400,
      `not a readable zip archive: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const entries = Object.entries(unzipped).filter(
    ([name]) => !name.endsWith("/"),
  );
  if (entries.length > MAX_IMPORT_ENTRIES) {
    throw new MigrationImportError(413, "archive has too many entries");
  }
  const unpackedTotal = entries.reduce((sum, [, data]) => sum + data.length, 0);
  if (unpackedTotal > MAX_IMPORT_UNPACKED_BYTES) {
    throw new MigrationImportError(413, "archive decompresses too large");
  }

  // One listing up front → O(1) existence checks for skip-existing.
  const existing = new Set(
    (await opts.vfs.listDetailed(opts.root)).map((s) => s.key),
  );

  const result: MigrationImportResult = {
    written: 0,
    skipped: 0,
    rejected: [],
    sessionsRebuilt: Boolean(opts.agentDir),
  };
  const events = new Set<AgentFileChangeEvent["type"]>();
  const transcripts: StoredConversation[] = [];

  for (const [name, data] of entries) {
    const rel = safeSeedKey(name);
    if (!rel || classifyMigrationPath(rel) === null) {
      result.rejected.push({ path: name, reason: "outside migration scope" });
      continue;
    }
    if (data.length > MAX_MIGRATION_FILE_BYTES) {
      result.rejected.push({ path: rel, reason: "too-large" });
      continue;
    }
    const key = `${opts.root}/${rel}`;
    if (!opts.overwrite && existing.has(key)) {
      result.skipped++;
      continue;
    }
    await opts.vfs.writeBytes(key, Buffer.from(data));
    result.written++;
    const eventType = migrationEventType(rel);
    if (eventType) events.add(eventType);
    if (
      opts.agentDir &&
      rel.startsWith(".houston/runtime/conversations/") &&
      rel.endsWith(".json")
    ) {
      try {
        transcripts.push(
          JSON.parse(Buffer.from(data).toString("utf8")) as StoredConversation,
        );
      } catch {
        // The transcript file itself is imported verbatim either way; an
        // unparseable one just gets no synthesized session.
        result.rejected.push({ path: rel, reason: "transcript not parseable" });
      }
    }
  }

  if (opts.agentDir) {
    for (const conv of transcripts) {
      synthesizeSessionFromTranscript(opts.agentDir, conv);
    }
  }
  return { result, events };
}
