/**
 * Run grouping for sender attribution (HOU-960): in a group chat a name and a
 * face are an ANSWER to "who is talking now", so they are printed once per
 * change of speaker, not once per message. Three messages in a row from Ada
 * carry Ada's face and name on the first only; the next two are bare bubbles
 * lined up beneath it.
 *
 * Kept pure and JSX-free (a `.ts` module) so the rule is unit-testable under
 * `node --experimental-strip-types --test`; `chat-messages.tsx` calls it once
 * per render and hands each row its answer.
 */

import type { ChatDisplayItem } from "./chat-process-groups";
import type { ChatMessage } from "./feed-to-messages";

/** Every assistant turn belongs to the same speaker: the agent. */
export const AGENT_RUN_KEY = "agent";

/**
 * The speaker a message is attributed to. Two messages share a run when their
 * keys match.
 *
 * A user message keys on its author's id; an AUTHORLESS user message keys on
 * the empty id, which is correct on both paths that produce one (single-player,
 * where nothing is attributed at all, and a legacy turn that predates author
 * stamping). A system message gets a key unique to itself, so it can never join
 * a run and always breaks the one it interrupts: after a "context compacted"
 * divider the reader has lost the thread and the next speaker must reintroduce
 * themselves.
 */
export function senderRunKey(message: ChatMessage): string {
  if (message.from === "user") return `user:${message.author?.userId ?? ""}`;
  if (message.from === "system") return `system:${message.key}`;
  return AGENT_RUN_KEY;
}

/**
 * The keys of the messages that START a run — the rows that print a name and a
 * face.
 *
 * Process blocks (an agent's tool/reasoning work) are TRANSPARENT here: they
 * neither start nor break a run, because they render no sender line of their
 * own. Skipping them means "you asked, the agent worked, the agent replied"
 * still introduces the agent on its reply, while "agent replies, agent works,
 * agent replies again" correctly stays one run.
 */
export function senderRunStarts(
  items: readonly ChatDisplayItem[],
): Set<string> {
  const starts = new Set<string>();
  let previous: string | undefined;
  for (const item of items) {
    if (item.kind === "process") continue;
    const key = senderRunKey(item.message);
    if (key !== previous) starts.add(item.message.key);
    previous = key;
  }
  return starts;
}
