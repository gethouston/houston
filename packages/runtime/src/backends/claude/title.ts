import type { Options } from "@anthropic-ai/claude-agent-sdk";
import {
  ClaudeBackendUnavailableError,
  type ClaudeToken,
  tokenEnv,
} from "./backend";
import { resolveClaudeExecutable } from "./binary-path";
import { toSdkModel } from "./model";
import { claudeConfigDir } from "./paths";
import type { ClaudeQuery } from "./session";
import { createStreamTranslator } from "./translate";

/**
 * One-shot conversation title through the Claude Agent SDK. The COMPLIANCE reason
 * this exists: when the active provider is `anthropic`, the title must run through
 * the `claude` subprocess (token in `options.env`) exactly like a turn — never
 * pi's in-process Anthropic client, which is the harness-spoofing path Anthropic
 * server-blocks. So this is a real SDK query, not a completion helper.
 *
 * It is deliberately minimal vs a `ClaudeSession`: `allowedTools: []` (titles need
 * no tools), NO session persistence (no resume, no sessions.json write — a title
 * is a throwaway), and the isolated `CLAUDE_CONFIG_DIR` so nothing on the host
 * leaks in. Text is collected via the SAME stream translator turns use, so a
 * `provider_error` (rate limit, auth) simply yields no text → the caller falls
 * back to a truncated title rather than throwing.
 */
export interface ClaudeTitleParams {
  /** The excerpt to title. */
  excerpt: string;
  /** The product-neutral title system prompt (owned by the caller). */
  titlePrompt: string;
  workspaceDir: string;
  dataDir: string;
  readToken: () => ClaudeToken | undefined;
  /** pi model id to title with; mapped to the SDK model string. */
  modelId?: string;
  /** Injected for tests; production lazily imports the optional SDK. */
  query?: ClaudeQuery;
}

export async function titleWithClaude(p: ClaudeTitleParams): Promise<string> {
  let query = p.query;
  if (!query) {
    try {
      const sdk = await import("@anthropic-ai/claude-agent-sdk");
      query = sdk.query as ClaudeQuery;
    } catch (err) {
      throw new ClaudeBackendUnavailableError(err);
    }
  }

  // undefined on the Node path; set only inside the Bun-compiled desktop sidecar
  // (same as a turn — see backend.ts / binary-path.ts).
  const pathToClaudeCodeExecutable = resolveClaudeExecutable();
  const options: Options = {
    cwd: p.workspaceDir,
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: claudeConfigDir(p.dataDir),
      ...tokenEnv(p.readToken()),
    },
    ...(pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable } : {}),
    settingSources: [],
    allowedTools: [],
    systemPrompt: p.titlePrompt,
    includePartialMessages: true,
    permissionMode: "default",
    ...(p.modelId ? { model: toSdkModel(p.modelId) } : {}),
  };

  let text = "";
  const translator = createStreamTranslator({ onContextTokens: () => {} });
  for await (const msg of query({ prompt: p.excerpt, options })) {
    for (const wire of translator.translate(msg)) {
      if (wire.type === "text") text += wire.data;
    }
  }
  return text.trim().split("\n")[0]?.trim().slice(0, 80) ?? "";
}
