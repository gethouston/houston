import { rmSync } from "node:fs";
import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import { isRoutineConversation } from "../session/routine-context";
import { ROUTINE_REPLAY_TAIL } from "../session/routine-replay";
import { ArchiveSegmentMissingError } from "../store/conversation-archive-missing";
import { getHistoryAt } from "../store/conversation-file";
import type { ArchiveLoader } from "./turn-archive-fetch";

export function resetPooledRoutineSession(input: {
  dataDir: string;
  conversationId: string;
  fire: boolean;
}): boolean {
  if (!input.fire || !isRoutineConversation(input.conversationId)) return false;
  rmSync(join(input.dataDir, "sessions", input.conversationId), {
    recursive: true,
    force: true,
  });
  return true;
}

export async function loadRoutineReplayArchive(
  loadArchive: ArchiveLoader | undefined,
  conversationId: string,
): Promise<void> {
  if (!isRoutineConversation(conversationId)) return;
  try {
    await loadArchive?.(conversationId, { limit: ROUTINE_REPLAY_TAIL });
  } catch (error) {
    if (!(error instanceof ArchiveSegmentMissingError)) throw error;
  }
}

export function routineReplayHistory(
  dataDir: string,
  conversationId: string,
  canonical: ChatMessage[],
): ChatMessage[] {
  if (!isRoutineConversation(conversationId)) return canonical;
  return (
    getHistoryAt(join(dataDir, "conversations"), conversationId, {
      limit: ROUTINE_REPLAY_TAIL,
    })?.messages ?? []
  );
}
