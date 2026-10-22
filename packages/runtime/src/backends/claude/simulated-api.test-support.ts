import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeQuery } from "./session";

/**
 * A stand-in for the Anthropic API behind the Claude Agent SDK, sized in
 * tokens, for tests about what a resumed session costs.
 *
 * Every SDK session id carries the tokens its transcript holds. A query that
 * resumes one pays that whole transcript again, plus the system prompt and its
 * own prompt (4 characters ≈ 1 token), and is refused the way the CLI reports
 * it — an `invalid_request` assistant message reading "Prompt is too long: N
 * tokens > W maximum" — when the request exceeds `windowTokens`. A refused
 * query does not grow its session, exactly like the real API: nothing new was
 * said. A query that fits grows its session by its prompt, a short reply and
 * `runGrowthTokens` (the tool output a routine run reads while it works).
 *
 * Like the real SDK, each session leaves a transcript file under
 * `<CLAUDE_CONFIG_DIR>/projects/<cwd slug>/`, which is what Houston's sessions
 * store checks before it resumes one.
 */
export interface SimulatedClaudeCall {
  prompt: string;
  resume: string | undefined;
  requestTokens: number;
  refused: boolean;
  /** The CLI's first-byte deadline the call's env carried. */
  apiTimeoutMs: string | undefined;
}

export interface SimulatedClaudeApi {
  query: ClaudeQuery;
  calls: SimulatedClaudeCall[];
  /** Give an existing session id a transcript of `tokens` tokens. */
  seedSession(id: string, tokens: number): void;
  /** The tokens a session's transcript holds now. */
  sessionTokens(id: string): number | undefined;
}

export const SIMULATED_REPLY =
  "Checked everything; nothing new since the last run.";

export function simulatedClaudeApi(opts: {
  windowTokens: number;
  systemTokens: number;
  runGrowthTokens: number;
}): SimulatedClaudeApi {
  const sessions = new Map<string, number>();
  const calls: SimulatedClaudeCall[] = [];
  let minted = 0;
  const tokensOf = (text: string) => Math.ceil(text.length / 4);

  const query: ClaudeQuery = async function* ({ prompt, options }) {
    const resume = options.resume;
    if (resume !== undefined && !sessions.has(resume))
      throw new Error(`No conversation found with session ID: ${resume}`);
    minted += resume === undefined ? 1 : 0;
    const sessionId = resume ?? `sim-${minted}`;
    const configDir = options.env?.CLAUDE_CONFIG_DIR;
    if (configDir && options.cwd) {
      const slugDir = join(
        configDir,
        "projects",
        options.cwd.replace(/[^A-Za-z0-9]/g, "-"),
      );
      mkdirSync(slugDir, { recursive: true });
      writeFileSync(join(slugDir, `${sessionId}.jsonl`), "{}\n");
    }
    const prior = sessions.get(sessionId) ?? 0;
    const requestTokens = opts.systemTokens + prior + tokensOf(prompt);
    const refused = requestTokens > opts.windowTokens;
    calls.push({
      prompt,
      resume,
      requestTokens,
      refused,
      apiTimeoutMs: options.env?.API_TIMEOUT_MS,
    });
    const model = options.model ?? null;
    yield sdk({ type: "system", subtype: "init", session_id: sessionId });
    if (refused) {
      const text = `Prompt is too long: ${requestTokens} tokens > ${opts.windowTokens} maximum`;
      if (!sessions.has(sessionId)) sessions.set(sessionId, prior);
      yield sdk({
        type: "assistant",
        error: "invalid_request",
        message: {
          model,
          content: [{ type: "text", text }],
          usage: { input_tokens: 0, output_tokens: 0 },
        },
        parent_tool_use_id: null,
        session_id: sessionId,
      });
      yield sdk({
        type: "result",
        subtype: "success",
        is_error: true,
        result: text,
        usage: { input_tokens: 0, output_tokens: 0 },
        session_id: sessionId,
      });
      return;
    }
    const usage = { input_tokens: requestTokens, output_tokens: 20 };
    yield sdk({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: SIMULATED_REPLY },
      },
      session_id: sessionId,
      parent_tool_use_id: null,
    });
    yield sdk({
      type: "assistant",
      message: {
        model,
        content: [{ type: "text", text: SIMULATED_REPLY }],
        usage,
      },
      parent_tool_use_id: null,
      session_id: sessionId,
    });
    sessions.set(
      sessionId,
      prior + tokensOf(prompt) + opts.runGrowthTokens + usage.output_tokens,
    );
    yield sdk({
      type: "result",
      subtype: "success",
      usage,
      session_id: sessionId,
    });
  };

  return {
    query,
    calls,
    seedSession: (id, tokens) => {
      sessions.set(id, tokens);
    },
    sessionTokens: (id) => sessions.get(id),
  };
}

/** The SDK message union is far wider than a simulation needs to fill in. */
function sdk(message: Record<string, unknown>): SDKMessage {
  // SAFETY: each literal above carries every field Houston's translator reads
  // for its message type; the SDK's remaining fields are unused here.
  return message as unknown as SDKMessage;
}
