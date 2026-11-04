import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { routineRunFailure } from "@houston/domain";
import {
  providerErrorSummary,
  routineRunFailureSummary,
} from "@houston/host/src/schedule/run-failure";
import type {
  ProviderError,
  RoutineRun,
  RoutineRunFailure,
} from "@houston/protocol";
import { type ChatMessage, isCompactionSummary } from "@houston/protocol";

/** What a routine turn left in its conversation. */
export interface RoutineReply {
  content: string;
  /** Set when the turn failed on a typed provider error (auth, quota…). */
  providerError?: ProviderError;
}

interface StoredMessage {
  role?: string;
  content?: string;
  turnId?: string;
  providerError?: ProviderError;
}

/**
 * The assistant message this run's turn persisted. A failed turn's is empty
 * and carries its typed providerError, which is what classifies the run
 * (reconcile reads the same message on a standing pod). A shared routine chat
 * holds earlier runs' replies: a latest message stamped with another turn is
 * not this run's answer, and reusing its providerError would count an old
 * failure again. Messages from before turn stamps are read as before.
 */
export async function lastAssistantReply(
  workspaceDir: string,
  conversationId: string,
  turnId: string,
): Promise<RoutineReply> {
  const path = join(
    workspaceDir,
    ".houston",
    "runtime",
    "conversations",
    `${encodeURIComponent(conversationId)}.json`,
  );
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      messages?: StoredMessage[];
    };
    const messages = parsed.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role !== "assistant") continue;
      if (message.turnId !== undefined && message.turnId !== turnId) break;
      // A summary is the model's memory, not what the run reported.
      if (
        isCompactionSummary(
          message as ChatMessage,
          messages[i + 1] as ChatMessage | undefined,
        )
      )
        continue;
      return {
        content: message.content ?? "",
        ...(message.providerError
          ? { providerError: message.providerError }
          : {}),
      };
    }
  } catch {
    // A missing or unreadable conversation classifies as surfaced-with-empty
    // summary rather than failing the settle: the turn's own outcome already
    // told the user what happened.
  }
  return { content: "" };
}

/**
 * The errored run row for a turn that failed, or null when it answered. A
 * typed failure (the caller's, or the one the provider error maps to) gets the
 * whose-account-is-it sentence; any other provider error keeps the provider's
 * own words; a plain turn error keeps its message.
 */
export function routineRunError(
  row: RoutineRun,
  reply: RoutineReply,
  opts: { turnError?: string; failure?: RoutineRunFailure; nowIso: string },
): RoutineRun | null {
  const failure =
    opts.failure ??
    (reply.providerError ? routineRunFailure(reply.providerError) : undefined);
  const summary = failure
    ? routineRunFailureSummary(failure)
    : reply.providerError
      ? providerErrorSummary(reply.providerError)
      : opts.turnError;
  if (summary === undefined) return null;
  return {
    ...row,
    status: "error",
    summary,
    ...(failure ? { failure } : {}),
    completed_at: opts.nowIso,
  };
}
