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

const LEARNINGS_SAVE_PATH = "/sandbox/learnings/save";

export interface FactHarvestTarget {
  call: SandboxFetch | null;
  workspaceDir: string;
}

const processTarget = (): FactHarvestTarget => ({
  call: sandboxCall,
  workspaceDir: config.workspaceDir,
});

// WHY: Compaction runs outside runWithConversationId; the ambient id would lose provenance. ADR-0012
export async function compactWithFactHarvest(
  session: HarnessSession,
  conversationId: string,
  target: FactHarvestTarget = processTarget(),
): Promise<void> {
  const outcome = await session.compact(
    durableFactsInstructions(conversationId),
  );
  await harvestDurableFacts(conversationId, outcome, target);
}

// WHY: The host append dedupes by record id, not text; known facts must be dropped here. ADR-0012
async function harvestDurableFacts(
  conversationId: string,
  outcome: CompactionOutcome | undefined,
  { call, workspaceDir }: FactHarvestTarget,
): Promise<void> {
  if (!isAssistantConversation(conversationId)) return;
  const facts = parseDurableFacts(outcome?.summary);
  if (facts.length === 0 || !call) return;

  const known = new Set(
    loadAgentLearnings(workspaceDir).map((item) => normalizeFact(item.text)),
  );
  for (const fact of facts) {
    const key = normalizeFact(fact);
    if (known.has(key)) continue;
    known.add(key);
    await saveFact(call, conversationId, fact);
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
