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

export interface RoutineReply {
  content: string;
  providerError?: ProviderError;
}

interface StoredMessage {
  role?: string;
  content?: string;
  turnId?: string;
  providerError?: ProviderError;
}

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
  } catch {}
  return { content: "" };
}

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
