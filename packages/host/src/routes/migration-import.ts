import { existsSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { type AgentFileChangeEvent, agentFileEventType } from "@houston/domain";
import { importedHistoryNote, messageFor } from "../migrate/reconstruct";
import type { StoredConversation } from "../migrate/types";
import type { Vfs } from "../vfs";
import { importedFileBytes, safeSeedKey } from "./agent-seed";
import { unzipCapped, ZipLimitError } from "./capped-unzip";
import {
  classifyMigrationPath,
  MAX_IMPORT_ENTRIES,
  MAX_IMPORT_UNPACKED_BYTES,
  MAX_MIGRATION_FILE_BYTES,
} from "./migration-scope";

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
  sessionsRebuilt: boolean;
}

function migrationEventType(rel: string): AgentFileChangeEvent["type"] | null {
  if (rel.startsWith(".houston/runtime/")) return "ConversationsChanged";
  return agentFileEventType(rel);
}

function synthesizeSessionFromTranscript(
  agentDir: string,
  conv: StoredConversation,
  listedSessions: ReadonlySet<string>,
): void {
  if (!conv.id || /[/\\]/.test(conv.id) || conv.id.includes("..")) return;
  const sessionDir = join(agentDir, ".houston", "runtime", "sessions", conv.id);
  if (listedSessions.has(conv.id) || existsSync(sessionDir)) return;
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
  mgr.appendMessage(importedHistoryNote(lastTs));
}

export async function applyMigrationArchive(opts: {
  vfs: Vfs;
  root: string;
  agentDir?: string;
  bytes: Buffer;
  overwrite: boolean;
  routineCreatedBy?: string;
}): Promise<{
  result: MigrationImportResult;
  events: Set<AgentFileChangeEvent["type"]>;
}> {
  let entries: [string, Uint8Array][];
  try {
    entries = unzipCapped(new Uint8Array(opts.bytes), {
      maxEntries: MAX_IMPORT_ENTRIES,
      maxUnpackedBytes: MAX_IMPORT_UNPACKED_BYTES,
    });
  } catch (err) {
    if (err instanceof ZipLimitError)
      throw new MigrationImportError(
        413,
        err.breach === "too_many_entries"
          ? "archive has too many entries"
          : "archive decompresses too large",
      );
    throw new MigrationImportError(
      400,
      `not a readable zip archive: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

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
    const transcript =
      opts.agentDir &&
      rel.startsWith(".houston/runtime/conversations/") &&
      rel.endsWith(".json");
    if (!opts.overwrite && existing.has(key)) {
      result.skipped++;
      if (transcript) {
        const kept = await opts.vfs.readText(key);
        if (kept !== null) parseTranscript(Buffer.from(kept), transcripts);
      }
      continue;
    }
    await opts.vfs.writeBytes(
      key,
      importedFileBytes(rel, data, opts.routineCreatedBy),
    );
    result.written++;
    const eventType = migrationEventType(rel);
    if (eventType) events.add(eventType);
    if (transcript && !parseTranscript(data, transcripts))
      result.rejected.push({ path: rel, reason: "transcript not parseable" });
  }

  if (opts.agentDir) {
    const sessionsRoot = `${opts.root}/.houston/runtime/sessions/`;
    const listedSessions = new Set(
      [...existing]
        .filter((key) => key.startsWith(sessionsRoot))
        .map((key) => key.slice(sessionsRoot.length).split("/")[0] ?? ""),
    );
    for (const conv of transcripts) {
      synthesizeSessionFromTranscript(opts.agentDir, conv, listedSessions);
    }
  }
  return { result, events };
}

function parseTranscript(
  data: Uint8Array,
  into: StoredConversation[],
): boolean {
  try {
    into.push(
      JSON.parse(Buffer.from(data).toString("utf8")) as StoredConversation,
    );
    return true;
  } catch {
    return false;
  }
}
