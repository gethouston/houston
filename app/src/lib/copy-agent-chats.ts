import type {
  ConversationEntry,
  MigrationImportResult,
} from "@houston-ai/engine-client";

/**
 * "Copy an agent" with chats: move the source's tasks and their conversations
 * into the copy through the agent-scoped migration routes (the same pair the
 * desktop→cloud migration uses), which exist on every host and are proxied by
 * the cloud gateway. Pure planning here, unit-tested in
 * `app/tests/copy-agent-chats.test.ts`; the runner takes the engine as an
 * argument so a test can hand it a fake.
 */

/** The board file every task row lives in. */
export const ACTIVITY_PATH = ".houston/activity/activity.json";
const TRANSCRIPTS_DIR = ".houston/runtime/conversations";

/** Conversations per export/import round trip. Transcripts are small JSON
 *  and compress well; this keeps a chatty agent far under the import cap. */
export const CHAT_COPY_BATCH = 25;

/** The transcript file of one conversation, as the runtime names it. */
export function transcriptPath(sessionKey: string): string {
  return `${TRANSCRIPTS_DIR}/${encodeURIComponent(sessionKey)}.json`;
}

/**
 * Everything the chats copy carries: the board file, then one transcript per
 * conversation. Duplicated session keys collapse; a missing transcript on the
 * source is simply skipped by the export route.
 */
export function chatCopyPaths(
  conversations: readonly Pick<ConversationEntry, "session_key">[],
): string[] {
  const keys = new Set(conversations.map((c) => c.session_key));
  return [ACTIVITY_PATH, ...[...keys].map(transcriptPath)];
}

export function batchPaths(paths: readonly string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < paths.length; i += size) {
    out.push(paths.slice(i, i + size));
  }
  return out;
}

export interface ChatCopyEngine {
  listConversations(agentPath: string): Promise<ConversationEntry[]>;
  migrationExport(agentPath: string, paths: string[]): Promise<ArrayBuffer>;
  migrationImport(
    agentPath: string,
    bytes: ArrayBuffer,
    opts?: { overwrite?: boolean },
  ): Promise<MigrationImportResult>;
}

export interface ChatCopyOutcome {
  conversations: number;
  written: number;
  rejected: MigrationImportResult["rejected"];
}

/**
 * Copy every conversation of `source` into `target`, batch by batch. The
 * target is brand new, so nothing is overwritten and a batch that lands
 * twice is a no-op (the import route skips existing files).
 */
export async function copyAgentChats(
  engine: ChatCopyEngine,
  source: string,
  target: string,
): Promise<ChatCopyOutcome> {
  const conversations = await engine.listConversations(source);
  const outcome: ChatCopyOutcome = {
    conversations: conversations.length,
    written: 0,
    rejected: [],
  };
  for (const batch of batchPaths(
    chatCopyPaths(conversations),
    CHAT_COPY_BATCH,
  )) {
    const zip = await engine.migrationExport(source, batch);
    const result = await engine.migrationImport(target, zip);
    outcome.written += result.written;
    outcome.rejected.push(...result.rejected);
  }
  return outcome;
}
