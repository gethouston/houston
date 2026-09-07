import type { CompactionOutcome, HarnessSession } from "../backends/types";
import { config } from "../config";
import {
  durableFactsInstructions,
  isAssistantConversation,
  normalizeFact,
  parseDurableFacts,
} from "./durable-facts";
import { loadAgentLearnings } from "./learnings-context";
import { sandboxCall } from "./sandbox-call";
import type { SandboxFetch } from "./tools/sandbox-fetch";
import { CONVERSATION_ID_HEADER } from "./tools/save-learning";

/**
 * The I/O half of the compact-time fact extraction (see durable-facts.ts): run
 * the compaction with the assistant's extra instructions, then save whatever
 * facts the summary carried as memories.
 *
 * BEST-EFFORT BY CONSTRUCTION. Compaction exists to keep a long chat working,
 * and nothing here may cost the user that: a rejected save, an unreachable host,
 * or a summary with no block at all is logged and dropped, never raised. The
 * compaction guard's bounded/deterministic paths make no model call and so carry
 * no facts either — also fine, the next compaction tries again.
 *
 * The conversation id is PASSED IN, never read from the turn's AsyncLocalStorage
 * store: compaction runs outside `runWithConversationId` (which spans `prompt()`
 * only), so the ambient store is empty here. Same reason there is no acting-as
 * header — that context is established for the prompt, not for compaction — so
 * the host stamps a compacted fact with the mission but no teacher.
 */

/** The host route the `save_learning` tool writes through (merge-safe). */
const LEARNINGS_SAVE_PATH = "/sandbox/learnings/save";

/**
 * Compact `session`, asking the summarizer for the assistant's durable facts and
 * saving the ones it returns. For every other conversation this is exactly
 * today's `session.compact()` with no instructions and nothing persisted.
 */
export async function compactWithFactHarvest(
  session: HarnessSession,
  conversationId: string,
): Promise<void> {
  const outcome = await session.compact(
    durableFactsInstructions(conversationId),
  );
  await harvestDurableFacts(conversationId, outcome);
}

/**
 * Save the durable facts a compaction summary carried. Skips silently for a
 * non-assistant conversation, a backend that returned no summary, a summary with
 * no (or an unparseable) block, and any fact this agent already remembers.
 */
async function harvestDurableFacts(
  conversationId: string,
  outcome: CompactionOutcome | undefined,
): Promise<void> {
  if (!isAssistantConversation(conversationId)) return;
  const facts = parseDurableFacts(outcome?.summary);
  // No host to write through (a runtime with no sandbox token) — the same gate
  // that leaves the `save_learning` tool unregistered.
  if (facts.length === 0 || !sandboxCall) return;

  // Already-known facts are dropped here rather than at the host: a summarizer
  // re-states the same standing preference at every compaction, and the append
  // route is idempotent on ID only, so nothing else would stop the duplicates.
  const known = new Set(
    loadAgentLearnings(config.workspaceDir).map((item) =>
      normalizeFact(item.text),
    ),
  );
  for (const fact of facts) {
    const key = normalizeFact(fact);
    if (known.has(key)) continue;
    known.add(key);
    // Sequential: the host's write is a doc-locked read-modify-write, so
    // parallel saves would only queue on that lock.
    await saveFact(sandboxCall, conversationId, fact);
  }
}

async function saveFact(
  call: SandboxFetch,
  conversationId: string,
  text: string,
): Promise<void> {
  try {
    const res = await call(LEARNINGS_SAVE_PATH, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [CONVERSATION_ID_HEADER]: conversationId,
      },
      body: JSON.stringify({ text }),
    });
    if (res.ok) return;
    const detail = await res.text().catch(() => "");
    console.warn(
      `[durable-facts] host refused a compacted fact (${res.status}): ${detail.slice(0, 200)}`,
    );
  } catch (err) {
    console.warn(
      "[durable-facts] saving a compacted fact failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
