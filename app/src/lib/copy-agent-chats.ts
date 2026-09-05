import type {
  ConversationEntry,
  MigrationImportOptions,
  MigrationImportResult,
} from "@houston-ai/engine-client";
import {
  ACTIVITY_PATH,
  planChatIdMap,
  remapChatArchive,
  transcriptPath,
} from "./copy-chat-remap.ts";

export { ACTIVITY_PATH, transcriptPath };

/**
 * "Copy an agent" with chats: move the source's tasks and their conversations
 * into the copy through the agent-scoped migration routes (the same pair the
 * desktop→cloud migration uses), which exist on every host and are proxied by
 * the cloud gateway. Pure planning here, unit-tested in
 * `app/tests/copy-agent-chats.test.ts`; the runner takes the engine as an
 * argument so a test can hand it a fake.
 */

/** Transcripts per export/import round trip. Transcripts are JSON text and
 *  compress well; ten of them stay far under the host's import body cap even
 *  for very long chats. */
export const CHAT_COPY_BATCH = 10;

/**
 * The transcripts the chats copy carries, one per conversation. Duplicated
 * session keys collapse; a missing transcript on the source is simply skipped
 * by the export route.
 */
export function chatCopyPaths(
  conversations: readonly Pick<ConversationEntry, "session_key">[],
): string[] {
  const keys = new Set(conversations.map((c) => c.session_key));
  return [...keys].map(transcriptPath);
}

/**
 * The requests, in order: the transcripts in batches, then the board file on
 * its own, LAST. The board is what makes the copied tasks visible, so it
 * must not land before their transcripts: an opened task whose transcript was
 * still in flight would start a new one, and the import skips existing files.
 */
export function chatCopyBatches(
  conversations: readonly Pick<ConversationEntry, "session_key">[],
  size: number = CHAT_COPY_BATCH,
): string[][] {
  return [...batchPaths(chatCopyPaths(conversations), size), [ACTIVITY_PATH]];
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
    opts?: MigrationImportOptions,
  ): Promise<MigrationImportResult>;
}

/**
 * Re-run one leg while the copy's engine is still waking. Both legs are
 * idempotent (the export reads; the import skips files it already has), so a
 * replay is safe. `shouldRetry` names the refusals worth waiting out.
 */
export async function withWakingRetry<T>(
  run: () => Promise<T>,
  shouldRetry: (err: unknown) => boolean,
  opts: { attempts: number; delayMs: number },
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= opts.attempts || !shouldRetry(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    }
  }
}

export interface ChatCopyOutcome {
  /** Conversations the source listed. */
  conversations: number;
  /** Transcripts the target actually wrote. */
  transcriptsWritten: number;
  /** Whether the board file landed. False when the target already had one
   *  (a task was created in the copy before the chats arrived). */
  boardWritten: boolean;
  rejected: MigrationImportResult["rejected"];
}

/** Every task and transcript landed: the only outcome worth calling done. */
export function chatCopyComplete(outcome: ChatCopyOutcome): boolean {
  return outcome.boardWritten && outcome.rejected.length === 0;
}

/**
 * Copy every conversation of `source` into `target`: the transcripts in
 * batches, then the board. Each archive is rewritten with fresh task and
 * conversation ids before it lands (see `copy-chat-remap.ts`); the map is
 * planned once so the board's rows match the transcripts that went before.
 * Nothing is overwritten: the import route skips a file the target already
 * has, which the outcome reports rather than hides.
 */
export async function copyAgentChats(
  engine: ChatCopyEngine,
  source: string,
  target: string,
  mint: () => string = () => crypto.randomUUID(),
  /** Refusals to wait out (the copy's engine still waking); none by default. */
  shouldRetry: (err: unknown) => boolean = () => false,
): Promise<ChatCopyOutcome> {
  const retry = { attempts: 12, delayMs: 10_000 };
  const conversations = await engine.listConversations(source);
  const outcome: ChatCopyOutcome = {
    conversations: conversations.length,
    transcriptsWritten: 0,
    boardWritten: false,
    rejected: [],
  };
  const map = planChatIdMap(conversations, mint);
  for (const batch of chatCopyBatches(conversations)) {
    const zip = await engine.migrationExport(source, batch);
    const remapped = remapChatArchive(new Uint8Array(zip), map, mint);
    const bytes = remapped.buffer.slice(
      remapped.byteOffset,
      remapped.byteOffset + remapped.byteLength,
    ) as ArrayBuffer;
    // The board replaces an EMPTY board on the target (a host may create one
    // at agent birth), never one that already holds a task the user made
    // while the chats were in flight: that lands as a skip, reported below.
    const overwrite =
      batch[0] === ACTIVITY_PATH &&
      (await engine.listConversations(target)).length === 0;
    // No pi session is rebuilt from the transcripts: each one carries the
    // replay marker (`copy-chat-remap.ts`), so the copy's FIRST turn in a chat
    // replays its history into whichever backend runs it, every provider alike.
    const result = await withWakingRetry(
      () =>
        engine.migrationImport(target, bytes, { overwrite, sessions: false }),
      shouldRetry,
      retry,
    );
    outcome.rejected.push(...result.rejected);
    if (batch[0] === ACTIVITY_PATH) outcome.boardWritten = result.written > 0;
    else outcome.transcriptsWritten += result.written;
  }
  return outcome;
}
