import type {
  ConversationEntry,
  MigrationImportOptions,
  MigrationImportResult,
} from "@houston/engine-adapter";
import {
  ACTIVITY_PATH,
  planChatIdMap,
  remapChatArchive,
  transcriptPath,
} from "./copy-chat-remap.ts";

export { ACTIVITY_PATH, transcriptPath };

export const CHAT_COPY_BATCH = 10;

export function chatCopyPaths(
  conversations: readonly Pick<ConversationEntry, "session_key">[],
): string[] {
  const keys = new Set(conversations.map((c) => c.session_key));
  return [...keys].map(transcriptPath);
}

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
  conversations: number;
  transcriptsWritten: number;
  boardWritten: boolean;
  rejected: MigrationImportResult["rejected"];
}

export function chatCopyComplete(outcome: ChatCopyOutcome): boolean {
  return outcome.boardWritten && outcome.rejected.length === 0;
}

export async function copyAgentChats(
  engine: ChatCopyEngine,
  source: string,
  target: string,
  mint: () => string = () => crypto.randomUUID(),
  shouldRetry: (err: unknown) => boolean = () => false,
  routineIds: Readonly<Record<string, string>> = {},
): Promise<ChatCopyOutcome> {
  const retry = { attempts: 12, delayMs: 10_000 };
  const conversations = await engine.listConversations(source);
  const outcome: ChatCopyOutcome = {
    conversations: conversations.length,
    transcriptsWritten: 0,
    boardWritten: false,
    rejected: [],
  };
  const map = planChatIdMap(conversations, mint, routineIds);
  for (const batch of chatCopyBatches(conversations)) {
    const zip = await engine.migrationExport(source, batch);
    const remapped = remapChatArchive(new Uint8Array(zip), map, mint);
    const bytes = remapped.buffer.slice(
      remapped.byteOffset,
      remapped.byteOffset + remapped.byteLength,
    ) as ArrayBuffer;
    const overwrite =
      batch[0] === ACTIVITY_PATH &&
      (await engine.listConversations(target)).length === 0;
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
