import { isAbsolute, relative, sep } from "node:path";
import type { AssistantRuntimeRole } from "@houston/domain/assistant-role";
import type { ChatMessage } from "@houston/runtime-client";
import { writeRoutineResultsAt } from "../store/routine-results";
import { readsRoutineResults } from "./coordinator-policy";
import {
  type ReplayPreamble,
  renderReplayPreamble,
  replayCharBudget,
} from "./replay-transcript";
import { isRoutineConversation } from "./routine-context";
import {
  renderRoutineDigest,
  renderRoutineResults,
  routineTurns,
} from "./routine-digest";

export const ROUTINE_REPLAY_TAIL = 200;

export interface RoutineReplayDirs {
  dataDir: string;
  workspaceDir: string;
  assistantRole: AssistantRuntimeRole | null;
}

export function routineReplay(
  dirs: RoutineReplayDirs,
  conversationId: string,
  messages: ReadonlyArray<ChatMessage>,
  currentTurnId: string,
): ReplayPreamble | null {
  const turns = routineTurns(messages, currentTurnId);
  if (turns.length === 0) return null;
  let pointer: string | null = null;
  if (!readsRoutineResults(dirs.assistantRole))
    return renderRoutineDigest(turns, pointer);
  try {
    const path = writeRoutineResultsAt(
      dirs.dataDir,
      conversationId,
      renderRoutineResults(turns),
    );
    const rel = relative(dirs.workspaceDir, path);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel))
      pointer = rel.split(sep).join("/");
  } catch (error) {
    console.error(
      `[routine] ${conversationId}: could not write the earlier runs' results:`,
      error,
    );
  }
  return renderRoutineDigest(turns, pointer);
}

export interface ConversationReplayInput {
  conversationId: string;
  messages: ReadonlyArray<ChatMessage>;
  currentTurnId: string;
  dirs: RoutineReplayDirs;
  windowTokens: number;
  reason?: "switch" | "reset";
}

export function replayForConversation(
  input: ConversationReplayInput,
): ReplayPreamble | null {
  if (isRoutineConversation(input.conversationId))
    return routineReplay(
      input.dirs,
      input.conversationId,
      input.messages,
      input.currentTurnId,
    );
  return renderReplayPreamble(
    input.messages,
    input.currentTurnId,
    replayCharBudget(input.windowTokens),
    input.reason,
  );
}
