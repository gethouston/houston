import { join, posix } from "node:path";
import { TurnErrorCode } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import {
  type HydrateManifest,
  StoreFencedError,
} from "@houston/runtime-client/object-sync";
import { loadConversation, saveConversation } from "../store/conversation-file";
import type { TurnDurabilityOptions } from "./turn-durability";
import { appendDurabilityError } from "./turn-durability-error";

/** The row publisher reads this file; its marker must agree with the terminal. */
export async function writeTurnStopMarker(
  opts: TurnDurabilityOptions,
  stopReason: TurnErrorCode,
): Promise<void> {
  const dir = join(opts.filesystem.dataDir, "conversations");
  const conversation = loadConversation(dir, opts.turn.conversationId);
  if (!conversation) throw new Error("wind-down conversation is missing");
  const userIndex = conversation.messages.findLastIndex(
    (m) => m.role === "user" && m.turnId === opts.turn.turnId,
  );
  let reply = conversation.messages
    .slice(userIndex + 1)
    .findLast(
      (m) =>
        m.role === "assistant" &&
        m.turnId === opts.turn.turnId &&
        m.compaction?.trigger !== "native",
    );
  if (!reply) {
    reply = {
      role: "assistant",
      content: "",
      ts: Date.now(),
      turnId: opts.turn.turnId,
    } satisfies ChatMessage;
    conversation.messages.push(reply);
  }
  reply.stopReason = stopReason;
  delete reply.pendingInteraction;
  conversation.updatedAt = Date.now();
  saveConversation(dir, conversation);
}

/** Keep a valid local row publishable even when its object correction fails. */
export async function reconcileTurnStopMarker(
  opts: TurnDurabilityOptions,
  syncedManifest?: HydrateManifest,
) {
  const outcome = {
    ...opts.outcome,
    stopReason: TurnErrorCode.TimeLimitUnsaved,
  };
  let localSaved = false;
  try {
    await writeTurnStopMarker(opts, TurnErrorCode.TimeLimitUnsaved);
    localSaved = true;
    const conversationKey = posix.join(
      opts.filesystem.dataRel,
      "conversations",
      `${encodeURIComponent(opts.turn.conversationId)}.json`,
    );
    const key = posix.join(opts.resolved.prefix, conversationKey);
    const signal = AbortSignal.timeout(5_000);
    const store = opts.resolved.live ?? opts.resolved.store;
    let generation = syncedManifest?.get(conversationKey)?.generation;
    if (!syncedManifest && opts.filesystem.generationAware) {
      // A sync exception discards its partial manifest. Read the generation
      // that actually landed, rather than the pre-sync create-only condition.
      const objects = await store.manifest?.(opts.resolved.prefix, { signal });
      if (!objects) throw new Error("wind-down marker generation unavailable");
      const object = objects.find((object) => object.key === key);
      if (object && !object.generation)
        throw new Error("wind-down marker generation unavailable");
      generation = object?.generation ?? "0";
    }
    await store.upload(
      join(opts.filesystem.storeRoot, ...conversationKey.split("/")),
      key,
      {
        signal,
        ...(opts.filesystem.generationAware
          ? { ifGenerationMatch: generation ?? "0" }
          : {}),
      },
    );
    return { outcome, localSaved };
  } catch (error) {
    if (error instanceof StoreFencedError) throw error;
    return {
      outcome: appendDurabilityError(
        outcome,
        `wind-down marker failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
      localSaved,
    };
  }
}
