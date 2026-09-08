import type { ChatMessage } from "@houston/runtime-client";
import {
  appendAssistantMessage,
  appendUserMessage,
} from "../store/conversations";
import { isTurnRunning, publish } from "./bus";
import { disposeConversation } from "./chat";
import { conversations, getConversation } from "./conversation-cache";
import type { ConversationCommand } from "./conversation-command";
import { isAssistantConversation } from "./durable-facts";
import { compactWithFactHarvest } from "./durable-facts-harvest";

/**
 * The I/O half of the conversation commands (see `conversation-command.ts` for
 * what they are and why they are matched exactly).
 *
 * A command occupies a TURN, without ever running the model: it records the
 * user's message, does its work, writes a boundary marker, and settles with
 * `done`. That shape is deliberate — every client already knows it, so the
 * composer spins and stops, a reconnecting client resumes, and the transcript
 * carries the same audit trail a channel relay would need, all without a line
 * of command-aware client code.
 *
 * The marker frames carry NO copy. The runtime is i18n-agnostic (it serves
 * users in three languages), so it emits the STRUCTURE — "the context was
 * cleared here" — and the app renders the sentence through `t()`.
 */

const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/**
 * Whether a command must be refused right now. Same posture as the
 * edit-and-resend rewind: neither may rewrite a conversation's context behind a
 * turn that is executing or queued on it, because both tear the live session
 * down under work the user is waiting on.
 */
export function conversationCommandBusy(id: string): boolean {
  return isTurnRunning(id) || (conversations.get(id)?.pending ?? 0) > 0;
}

/**
 * Run a command as its own turn. Fire-and-forget from the route's view, exactly
 * like `runTurn`: the outcome is delivered on the conversation's event stream,
 * never on the request that triggered it. Never rejects — a failure settles the
 * turn with an `error` frame, because a chat left spinning forever is the one
 * outcome worse than a failed command.
 */
export async function runConversationCommand(
  id: string,
  command: ConversationCommand,
  text: string,
  nonce?: string,
): Promise<void> {
  const turnId = crypto.randomUUID();
  // The user's own words, recorded and echoed exactly as a normal turn does:
  // the echo is what a client adopts this turn's id from, and the record is
  // what makes the command visible to every other reader of the transcript.
  appendUserMessage(id, text, { turnId });
  publish(id, {
    type: "user",
    data: { content: text, ts: Date.now(), nonce },
    turnId,
  });
  try {
    if (command === "compact") await compactNow(id, turnId);
    else await clearNow(id, turnId);
  } catch (err) {
    publish(id, { type: "error", data: { message: errMessage(err) }, turnId });
    return;
  }
  publish(id, { type: "done", data: null, turnId });
}

/**
 * `/compact` — summarize now instead of waiting for the autocompact threshold.
 * The same call the runtime makes on its own, harvest included: for the
 * assistant's conversation the summarizer is asked for the durable facts the
 * summarized stretch revealed, so an early compaction still keeps what the
 * chat taught (session/durable-facts.ts).
 */
async function compactNow(id: string, turnId: string): Promise<void> {
  const conv = await getConversation(id);
  const compaction: NonNullable<ChatMessage["compaction"]> = {
    trigger: "manual",
    pre_tokens: conv.session.getContextUsage()?.tokens ?? null,
  };
  await compactWithFactHarvest(conv.session, id);
  // Persisted first, streamed second: the marker must exist on disk before any
  // client can be told to draw it, or a reload racing the frame loses it.
  appendAssistantMessage(id, "", { compaction, turnId });
  publish(id, { type: "context_compacted", data: compaction, turnId });
}

/**
 * `/clear` — start the model fresh WITHOUT deleting anything the user wrote.
 *
 * Three parts, in this order:
 *  1. Harvest the assistant's durable facts. This is the last moment the turns
 *     are in context, so it is the last chance to keep what they taught. Purely
 *     best-effort (a disconnected provider must not cost the user their clear),
 *     and skipped entirely for every other conversation.
 *  2. Drop the live session AND both backends' native session stores — the
 *     model's memory of this chat lives there, and deleting it is the reset.
 *     Deliberately NOT the truncation path's `needsSessionReplay`: a replay
 *     would carry the cleared turns straight back in.
 *  3. Mark the boundary in the transcript, which stays whole. The user keeps
 *     their history, `houston_recall` keeps its search space, and
 *     `renderReplayPreamble` reads the marker so a later session rebuild
 *     (a provider switch) can never resurrect the cleared turns either.
 */
/** pi's refusal when a session holds too little to summarize (its `compact()`
 *  throws `Nothing to compact (session too small)`). */
const NOTHING_TO_HARVEST = /nothing to compact/i;

async function clearNow(id: string, turnId: string): Promise<void> {
  if (isAssistantConversation(id)) {
    try {
      const conv = await getConversation(id);
      await compactWithFactHarvest(conv.session, id);
    } catch (err) {
      const why = errMessage(err);
      // A chat too short for pi to summarize is the ORDINARY state of a fresh
      // conversation, not a failure — logging it at warn level teaches us to
      // scroll past warnings. Everything else IS a failure and stays loud.
      if (NOTHING_TO_HARVEST.test(why)) {
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
