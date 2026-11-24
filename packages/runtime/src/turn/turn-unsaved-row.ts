import { join, posix } from "node:path";
import type { UnsavedFilesReport } from "@houston/protocol";
import {
  type HydrateManifest,
  StoreFencedError,
} from "@houston/runtime-client/object-sync";
import { userVisibleUnsavedFiles } from "@houston/wire-types";
import { loadConversation, saveConversation } from "../store/conversation-file";
import type { TurnDurabilityOptions } from "./turn-durability";

export async function recordUnsavedFiles(
  opts: TurnDurabilityOptions,
  report: UnsavedFilesReport | undefined,
  manifest: HydrateManifest,
  upload: boolean,
): Promise<"fenced" | undefined> {
  if (userVisibleUnsavedFiles(report).length === 0) return undefined;
  const dir = join(opts.filesystem.dataDir, "conversations");
  try {
    const conversation = loadConversation(dir, opts.turn.conversationId);
    if (!conversation) return undefined;
    const userIndex = conversation.messages.findLastIndex(
      (m) => m.role === "user" && m.turnId === opts.turn.turnId,
    );
    const reply = conversation.messages
      .slice(userIndex + 1)
      .findLast((m) => m.role === "assistant" && m.turnId === opts.turn.turnId);
    if (userIndex < 0 || !reply) return undefined;
    reply.unsavedFiles = report;
    const archived = JSON.stringify(conversation.archived);
    saveConversation(dir, conversation);
    if (!upload || JSON.stringify(conversation.archived) !== archived)
      return undefined;
    const conversationKey = posix.join(
      opts.filesystem.dataRel,
      "conversations",
      `${encodeURIComponent(opts.turn.conversationId)}.json`,
    );
    const entry = manifest.get(conversationKey);
    const store = opts.resolved.live ?? opts.resolved.store;
    const result = await store.upload(
      join(opts.filesystem.storeRoot, ...conversationKey.split("/")),
      posix.join(opts.resolved.prefix, conversationKey),
      {
        signal: AbortSignal.timeout(opts.deps.stopMarkerTimeoutMs ?? 5_000),
        ...(opts.filesystem.generationAware
          ? { ifGenerationMatch: entry?.generation ?? "0" }
          : {}),
      },
    );
    if (entry && result?.generation)
      manifest.set(conversationKey, {
        ...entry,
        generation: result.generation,
      });
  } catch (error) {
    if (error instanceof StoreFencedError) return "fenced";
    console.warn(
      `[turn] unsaved files not recorded on the reply conversation=${opts.turn.conversationId}`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
