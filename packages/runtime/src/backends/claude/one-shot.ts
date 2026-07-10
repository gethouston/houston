import type { Options } from "@anthropic-ai/claude-agent-sdk";
import {
  buildClaudeEnv,
  ClaudeBackendUnavailableError,
  type ClaudeToken,
} from "./backend";
import { resolveClaudeExecutable } from "./binary-path";
import { toSdkModel } from "./model";
import { claudeLoginConfigDir } from "./paths";
import type { ClaudeQuery } from "./session";
import { createStreamTranslator } from "./translate";

/**
 * Generic one-shot prompt through the Claude Agent SDK. The COMPLIANCE reason
 * this exists: when the active provider is `anthropic`, ANY throwaway LLM call
 * (title, anonymize, ...) must run through the `claude` subprocess (token in
 * `options.env`) exactly like a turn — never pi's in-process Anthropic client,
 * which is the harness-spoofing path Anthropic server-blocks.
 *
 * Deliberately minimal vs a `ClaudeSession`: `allowedTools: []`, NO session
 * persistence (no resume, no sessions.json write), and the SAME shared
 * `CLAUDE_CONFIG_DIR` (`claudeLoginConfigDir`) a turn uses, so it reads the
 * identical cached credential. Text is collected via the SAME stream
 * translator turns use, so a `provider_error` (rate limit, auth) simply
 * yields no text.
 */
export interface ClaudeOneShotParams {
  prompt: string;
  systemPrompt: string;
  workspaceDir: string;
  readToken: () => ClaudeToken | undefined;
  /** pi model id to run with; mapped to the SDK model string. */
  modelId?: string;
  /** Injected for tests; production lazily imports the optional SDK. */
  query?: ClaudeQuery;
}

export async function oneShotWithClaude(
  p: ClaudeOneShotParams,
): Promise<string> {
  let query = p.query;
  if (!query) {
    try {
      const sdk = await import("@anthropic-ai/claude-agent-sdk");
      query = sdk.query as ClaudeQuery;
    } catch (err) {
      throw new ClaudeBackendUnavailableError(err);
    }
  }

  // undefined on the Node path; set only inside the Bun-compiled desktop
  // sidecar (same as a turn — see backend.ts / binary-path.ts).
  const pathToClaudeCodeExecutable = resolveClaudeExecutable();
  const options: Options = {
    cwd: p.workspaceDir,
    env: buildClaudeEnv(claudeLoginConfigDir(), p.readToken()),
    ...(pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable } : {}),
    settingSources: [],
    allowedTools: [],
    systemPrompt: p.systemPrompt,
    includePartialMessages: true,
    permissionMode: "default",
    ...(p.modelId ? { model: toSdkModel(p.modelId) } : {}),
  };

  let text = "";
  const translator = createStreamTranslator({ onContextTokens: () => {} });
  for await (const msg of query({ prompt: p.prompt, options })) {
    for (const wire of translator.translate(msg)) {
      if (wire.type === "text") text += wire.data;
    }
  }
  return text;
}
