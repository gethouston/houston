import { rmSync } from "node:fs";
import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import { isRoutineConversation } from "../session/routine-context";
import { ROUTINE_REPLAY_TAIL } from "../session/routine-replay";
import { ArchiveSegmentMissingError } from "../store/conversation-archive-missing";
import { getHistoryAt } from "../store/conversation-file";
import type { ArchiveLoader } from "./turn-archive-fetch";

/**
 * The pooled worker's half of the routine context rule
 * (session/routine-context.ts): a routine FIRE deletes the conversation's
 * whole hydrated session dir and reports that the turn starts fresh. In the
 * pooled layout pi's session tails, the Claude `sessions.json` mapping and
 * transcript, and the harness marker all live under `sessions/<id>`, and the
 * sync-back propagates the deletes, so no later worker resumes the old
 * session either. Must run before the harness marker is written and before
 * the Claude resume is resolved. A person's turn keeps its session.
 */
export function resetPooledRoutineSession(input: {
  dataDir: string;
  conversationId: string;
  /** A routine fire (`TurnRequest.routine`), not a person chatting in it. */
  fire: boolean;
}): boolean {
  if (!input.fire || !isRoutineConversation(input.conversationId)) return false;
  rmSync(join(input.dataDir, "sessions", input.conversationId), {
    recursive: true,
    force: true,
  });
  return true;
}

/**
 * Fetch whatever part of a routine chat's replay tail the hot set left remote
 * (turn-archive-fetch.ts), before `routineReplayHistory` reads it: usually
 * nothing, as the newest segments hydrate with the turn. A segment the store
 * lost (already reported) only shortens the digest: failing here would fail
 * every run of the routine for good. Any other failure fails this turn.
 */
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

/**
 * What a pooled session rebuild replays from. A routine chat reads the same
 * archive-aware tail as the standing server (`ROUTINE_REPLAY_TAIL` messages,
 * after this run's own user row was appended): a rotation can leave only the
 * newest run live, and the runs before it are what the digest remembers.
 * Every other chat keeps its hydrated live file (`canonical`).
 */
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
