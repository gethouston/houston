import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { CompactionCheckpoints } from "../../store/conversation-compaction";
import type { CompactionOutcome } from "../types";
import type { SdkEffort } from "./effort";
import { denyEveryTool } from "./file-guard-hook";
import type { ClaudeQuery, TurnAuth } from "./session";
import type { SessionsStore } from "./sessions-store";
import { createStreamTranslator } from "./translate";

export interface ClaudeCompactionDeps {
  query: ClaudeQuery;
  conversationId: string;
  baseOptions: Options;
  sessionsStore: SessionsStore;
  compactions: CompactionCheckpoints;
  model: string;
  effort?: SdkEffort;
  env: TurnAuth["env"];
  abortController: AbortController;
}

const NOTHING_TO_COMPACT = "Nothing to compact (session too small)";

const SUMMARIZE = [
  "Summarize the conversation so far so it can continue in a fresh session with",
  "this summary as its only memory of it.",
  "Cover what the person asked for, what was decided, what was done and what is",
  "still open, plus any detail (names, ids, paths, preferences) a later turn",
  "would need and could not recover.",
  "Write the summary as prose addressed to your future self. Do not use any",
  "tool, and reply with the summary alone.",
].join(" ");

export function compactedPreamble(summary: string): string {
  return `[Summary of the conversation so far]\n${summary.trim()}\n[End of summary. Continue the conversation from here.]\n\n`;
}

// WHY: The SDK has no compaction control request; fact harvesting reads the summary text. ADR-0009
export async function compactClaudeSession(
  deps: ClaudeCompactionDeps,
  customInstructions?: string,
): Promise<CompactionOutcome> {
  const resume = deps.sessionsStore.resolveResume(
    deps.conversationId,
  )?.sessionId;
  if (!resume) throw new Error(NOTHING_TO_COMPACT);

  const options: Options = {
    ...deps.baseOptions,
    env: deps.env,
    model: deps.model,
    abortController: deps.abortController,
    resume,
    ...(deps.effort
      ? { thinking: deps.effort.thinking, effort: deps.effort.effort }
      : {}),
    allowedTools: [],
    hooks: { PreToolUse: [{ hooks: [denyEveryTool] }] },
    canUseTool: async () => ({
      behavior: "deny",
      message: "Tools are unavailable during summarization.",
    }),
  };

  const prompt = customInstructions
    ? `${SUMMARIZE}\n\n${customInstructions}`
    : SUMMARIZE;

  let summary = "";
  let failure: string | undefined;
  const translator = createStreamTranslator({ onContextTokens: () => {} });
  for await (const msg of deps.query({ prompt, options })) {
    for (const wire of translator.translate(msg)) {
      if (wire.type === "text") summary += wire.data;
      else if (wire.type === "provider_error")
        failure ??=
          wire.data.kind === "unknown"
            ? wire.data.raw_excerpt
            : wire.data.message;
    }
  }
  deps.abortController.signal.throwIfAborted();
  if (failure) throw new Error(`Summarization failed: ${failure}`);
  if (!summary.trim())
    throw new Error("Summarization failed: the summarizer returned no summary");

  deps.compactions.save(deps.conversationId, summary);
  deps.sessionsStore.purge(deps.conversationId);
  return { summary };
}
