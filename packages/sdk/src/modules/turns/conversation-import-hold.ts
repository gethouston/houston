import type { ConversationImportResult } from "@houston/protocol";
import type { Clock, PageLifecycle, SdkLogger } from "../../ports";
import { classifyImportFailure } from "./conversation-import-abort";
import type { PendingConversationImport } from "./conversation-import-outbox";

export type ImportSender = (
  entry: PendingConversationImport,
) => Promise<ConversationImportResult>;

export const RESEND_AFTER_MS = 3_000;
export const RESEND_MAX_MS = 30_000;

interface Held {
  entry: PendingConversationImport;
  promise: Promise<ConversationImportResult>;
  resolve: (result: ConversationImportResult) => void;
  reject: (err: unknown) => void;
  sending: boolean;
  timer: number | null;
  delayMs: number;
}

const keyOf = (e: PendingConversationImport): string =>
  `${e.agentId}\n${e.conversationId}\n${e.request.importId}`;

export function createConversationImportHold(
  lifecycle: PageLifecycle,
  clock: Clock,
  logger: SdkLogger,
  send: ImportSender,
  settle: (
    entry: PendingConversationImport,
    failure?: unknown,
  ) => Promise<void>,
) {
  const held = new Map<string, Held>();
  let stopListening: (() => void) | null = null;

  const arm = (h: Held) => {
    if (h.timer !== null) clock.clearTimeout(h.timer);
    h.timer = clock.setTimeout(() => {
      h.timer = null;
      void resend(h);
    }, h.delayMs);
    h.delayMs = Math.min(h.delayMs * 2, RESEND_MAX_MS);
  };

  const settleSafely = async (
    entry: PendingConversationImport,
    failure?: unknown,
  ): Promise<void> => {
    try {
      await settle(entry, failure);
    } catch (err) {
      logger.error("conversation import outbox write failed after a resend", {
        importId: entry.request.importId,
        conversationId: entry.conversationId,
        error: String(err),
      });
    }
  };

  const release = (h: Held) => {
    if (h.timer !== null) clock.clearTimeout(h.timer);
    held.delete(keyOf(h.entry));
    if (held.size === 0) {
      stopListening?.();
      stopListening = null;
    }
  };

  const resend = async (h: Held): Promise<void> => {
    if (h.sending) return;
    h.sending = true;
    if (h.timer !== null) {
      clock.clearTimeout(h.timer);
      h.timer = null;
    }
    let result: ConversationImportResult;
    try {
      result = await send(h.entry);
    } catch (err) {
      await settleSafely(h.entry, err);
      if (classifyImportFailure(err, true) === "aborted") {
        h.sending = false;
        arm(h);
        return;
      }
      release(h);
      h.reject(err);
      return;
    }
    await settleSafely(h.entry);
    release(h);
    h.resolve(result);
  };

  const onLive = () => {
    for (const h of [...held.values()]) {
      h.delayMs = RESEND_AFTER_MS;
      void resend(h);
    }
  };

  const hold = (
    entry: PendingConversationImport,
  ): Promise<ConversationImportResult> => {
    const existing = held.get(keyOf(entry));
    if (existing) return existing.promise;
    let resolve!: Held["resolve"];
    let reject!: Held["reject"];
    const promise = new Promise<ConversationImportResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const h: Held = {
      entry,
      promise,
      resolve,
      reject,
      sending: false,
      timer: null,
      delayMs: RESEND_AFTER_MS,
    };
    held.set(keyOf(entry), h);
    stopListening ??= lifecycle.onLive(onLive);
    arm(h);
    return promise;
  };

  const pending = (
    entry: PendingConversationImport,
  ): Promise<ConversationImportResult> | null =>
    held.get(keyOf(entry))?.promise ?? null;

  return { hold, pending };
}
