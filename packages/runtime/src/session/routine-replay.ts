import { isAbsolute, relative, sep } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import { writeRoutineResultsAt } from "../store/routine-results";
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

/**
 * What a routine chat carries into a fresh session, and the one rule every
 * rebuild of a routine chat follows: it opens on the short digest of its
 * latest turns (routine-digest.ts), never on a transcript sized to the window.
 * A routine chat is rebuilt on every fire (routine-context.ts) and for the
 * reasons any chat is (a provider switch across backends, an edit-and-resend,
 * a Claude resume the SDK refused); all of them carry the same digest.
 */

/**
 * How many of a chat's newest messages a routine rebuild reads: more than
 * the results file keeps, and a window rather than the whole history, so an
 * archived transcript is read no further back than its last segment or two.
 */
export const ROUTINE_REPLAY_TAIL = 200;

/** Where the runtime keeps its files and where the agent's tools work. */
export interface RoutineReplayDirs {
  dataDir: string;
  workspaceDir: string;
}

/**
 * The digest a fresh session of routine chat `conversationId` opens with,
 * after (re)writing the results file it points at. The pointer is the file's
 * path relative to the workspace, the root the agent's read tool resolves
 * against; a layout that keeps the runtime's data outside the workspace gets
 * the digest alone, since its read tool could never open the file.
 */
export function routineReplay(
  dirs: RoutineReplayDirs,
  conversationId: string,
  messages: ReadonlyArray<ChatMessage>,
  currentTurnId: string,
): ReplayPreamble | null {
  const turns = routineTurns(messages, currentTurnId);
  if (turns.length === 0) return null;
  let pointer: string | null = null;
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
    // The digest still carries the latest runs; only the way to the full
    // replies is lost for this turn.
    console.error(
      `[routine] ${conversationId}: could not write the earlier runs' results:`,
      error,
    );
  }
  return renderRoutineDigest(turns, pointer);
}

/** What a rebuilt session of one conversation needs to carry its history in. */
export interface ConversationReplayInput {
  conversationId: string;
  messages: ReadonlyArray<ChatMessage>;
  currentTurnId: string;
  dirs: RoutineReplayDirs;
  /** The active model's window, which sizes an ordinary chat's replay. */
  windowTokens: number;
  reason?: "switch" | "reset";
}

/**
 * The replay for ANY session rebuild: routine chats get their digest, every
 * other chat exactly the replay it always had.
 */
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
