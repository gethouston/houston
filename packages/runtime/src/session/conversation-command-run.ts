import type { ChatMessage } from "@houston/runtime-client";
import { config } from "../config";
import {
  appendAssistantMessage,
  appendUserMessage,
} from "../store/conversations";
import { isNothingToCompact } from "./autocompact-guard";
import { publish } from "./bus";
import { disposeConversation } from "./chat";
import { conversations, getConversation } from "./conversation-cache";
import type { ConversationCommand } from "./conversation-command";
import { beginConversationCommand } from "./conversation-command-gate";
import { isAssistantConversation } from "./durable-facts";
import { compactWithFactHarvest } from "./durable-facts-harvest";
import { holdTurnInFlight } from "./turn-inflight-count";
import { withWorkdirLock } from "./workdir-lock";

const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

export async function runConversationCommand(
  id: string,
  command: ConversationCommand,
  text: string,
  nonce?: string,
  turnId: string = crypto.randomUUID(),
): Promise<void> {
  const settle = beginConversationCommand(id);
  const conv = conversations.get(id);
  const run = (conv?.queue ?? Promise.resolve()).then(() => {
    appendUserMessage(id, text, { turnId, nonce });
    publish(id, {
      type: "user",
      data: { content: text, ts: Date.now(), nonce },
      turnId,
    });
    return withWorkdirLock(config.workspaceDir, () =>
      command === "compact" ? compactNow(id, turnId) : clearNow(id, turnId),
    );
  });
  if (conv) {
    conv.queue = run.catch(() => {});
    conv.pending++;
  }
  const releaseInFlight = holdTurnInFlight();
  try {
    await run;
    publish(id, { type: "done", data: null, turnId });
  } catch (err) {
    publish(id, { type: "error", data: { message: errMessage(err) }, turnId });
  } finally {
    if (conv) conv.pending--;
    releaseInFlight();
    settle();
  }
}

async function compactNow(id: string, turnId: string): Promise<void> {
  const conv = await getConversation(id);
  const compaction: NonNullable<ChatMessage["compaction"]> = {
    trigger: "manual",
    pre_tokens: conv.session.getContextUsage()?.tokens ?? null,
  };
  await compactWithFactHarvest(conv.session, id);
  appendAssistantMessage(id, "", { compaction, turnId });
  publish(id, { type: "context_compacted", data: compaction, turnId });
}

async function clearNow(id: string, turnId: string): Promise<void> {
  if (isAssistantConversation(id)) {
    try {
      const conv = await getConversation(id);
      await compactWithFactHarvest(conv.session, id);
    } catch (err) {
      const why = errMessage(err);
      if (isNothingToCompact(why)) {
        console.info(
          "[conversation-command] nothing to harvest before /clear:",
          why,
        );
      } else {
        console.warn(
          "[conversation-command] fact harvest before /clear failed:",
          why,
        );
      }
    }
  }
  await disposeConversation(id, { deleteSessions: true });
  appendAssistantMessage(id, "", { contextCleared: true, turnId });
  publish(id, { type: "context_cleared", data: null, turnId });
}
