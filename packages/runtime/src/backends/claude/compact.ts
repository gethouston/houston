import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { CompactionCheckpoints } from "../../store/conversation-compaction";
import type { CompactionOutcome } from "../types";
import type { ClaudeQuery, TurnAuth } from "./session";
import type { SessionsStore } from "./sessions-store";
import { createStreamTranslator } from "./translate";

/**
 * COMPACTION FOR THE CLAUDE AGENT SDK BACKEND — summarize-and-restart, the same
 * shape pi's compaction has, expressed in the only session controls this SDK
 * gives us: one `query()` and the conversationId → session_id mapping.
 *
 * The SDK exposes no compaction control request, so the compaction is performed
 * as a summarization turn INSIDE the conversation's own session (`resume`), and
 * the restart is the mapping being dropped: the next prompt therefore opens a
 * BRAND-NEW SDK session that carries only the summary (the session arms it as
 * the next prompt's prefix). That is the whole of what compaction means here —
 * the model's window holds a summary instead of the full history — and it is
 * what makes the summary text readable at all, which the assistant's durable-fact
 * harvest depends on (session/durable-facts.ts).
 *
 * FAILURE NEVER COSTS HISTORY. The mapping is dropped only after a non-empty
 * summary is in hand; a provider failure, an abort, or an empty answer throws
 * with the session mapping untouched, so the conversation keeps every turn it
 * had. The summarization turn itself runs tool-less and emits nothing on the
 * session's wire stream: it is Houston talking to the model about the
 * conversation, never a turn the user asked for.
 */

/** What one compaction needs; assembled by `ClaudeSession.compact`. */
export interface ClaudeCompactionDeps {
  query: ClaudeQuery;
  conversationId: string;
  /** The session's static options (cwd, systemPrompt, MCP servers, …). */
  baseOptions: Options;
  sessionsStore: SessionsStore;
  compactions: CompactionCheckpoints;
  /** SDK model string the summarization runs on (the session's current model). */
  model: string;
  /** The subprocess env carrying the CURRENT stored credential. */
  env: TurnAuth["env"];
  /** Cancels the summarization when the session is aborted or disposed. */
  abortController: AbortController;
}

/**
 * pi's refusal when a session holds too little to summarize. Reused VERBATIM
 * so both backends fail a pointless compaction with one sentence: the callers
 * match it to tell "this chat is too short" (an ordinary state of a fresh chat,
 * logged at info) apart from a real failure (session/conversation-command-run.ts).
 */
const NOTHING_TO_COMPACT = "Nothing to compact (session too small)";

/** The instruction the summarization turn carries. Model-facing, never shown to
 *  a user, so it is written in English like every other prompt the runtime
 *  builds (the runtime is i18n-agnostic). */
const SUMMARIZE = [
  "Summarize the conversation so far so it can continue in a fresh session with",
  "this summary as its only memory of it.",
  "Cover what the person asked for, what was decided, what was done and what is",
  "still open, plus any detail (names, ids, paths, preferences) a later turn",
  "would need and could not recover.",
  "Write the summary as prose addressed to your future self. Do not use any",
  "tool, and reply with the summary alone.",
].join(" ");

/** The prefix the NEXT prompt carries into the fresh session — the compacted
 *  history, marked so the model reads it as the record it is and not as
 *  something the person just said. */
export function compactedPreamble(summary: string): string {
  return `[Summary of the conversation so far]\n${summary.trim()}\n[End of summary. Continue the conversation from here.]\n\n`;
}

/**
 * Compact `conversationId`'s SDK session, returning the summary the fresh
 * session must be seeded with.
 *
 * Throws — never returns a false success — when there is nothing to compact,
 * when the provider refuses, or when the summarizer answers with nothing. The
 * caller (`/compact`, the autocompact path, the `/clear` fact harvest) surfaces
 * that as the turn's error instead of recording a compaction that never
 * happened.
 */
export async function compactClaudeSession(
  deps: ClaudeCompactionDeps,
  customInstructions?: string,
): Promise<CompactionOutcome> {
  const resume = deps.sessionsStore.resolveResume(deps.conversationId);
  // No SDK session yet (a conversation whose first turn has not run, or one
  // already compacted with nothing said since): there is no history in the
  // model's window to summarize.
  if (!resume) throw new Error(NOTHING_TO_COMPACT);

  const options: Options = {
    ...deps.baseOptions,
    env: deps.env,
    model: deps.model,
    abortController: deps.abortController,
    resume,
    // A summarizer that reaches for a tool is a summarizer that stops
    // summarizing: both surfaces are closed for this one turn (the built-ins
    // and the MCP tools Houston registers), leaving prose as the only output.
    tools: [],
    allowedTools: [],
    mcpServers: {},
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

  // The restart, and the LAST step: until this line the conversation still has
  // its full SDK session, so every throw above leaves the user's history whole.
  deps.compactions.save(deps.conversationId, summary);
  deps.sessionsStore.remove(deps.conversationId);
  return { summary };
}
