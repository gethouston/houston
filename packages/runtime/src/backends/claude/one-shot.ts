import type { Options } from "@anthropic-ai/claude-agent-sdk";
import {
  buildClaudeEnv,
  ClaudeBackendUnavailableError,
  type ClaudeToken,
} from "./backend";
import { resolveClaudeExecutable } from "./binary-path";
import { toSdkModel } from "./model";
import { claudeLoginConfigDir } from "./paths";
import {
  anthropicCredentialStorageDir,
  assertAnthropicScopeCredential,
} from "./scope-guard";
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
  /**
   * The runtime's data dir. Required whenever this can run under a PERSONAL
   * scope (every production caller — pass `config.dataDir`): it locates that
   * member's isolated Claude credential store, without which a mid-turn 401
   * would recover onto the pod-shared team credential. Omitting it is a hard
   * error on the personal path, never a silent fallback (`./scope-guard`).
   */
  dataDir?: string;
  /** pi model id to run with; mapped to the SDK model string. */
  modelId?: string;
  /** Injected for tests; production lazily imports the optional SDK. */
  query?: ClaudeQuery;
}

export async function oneShotWithClaude(
  p: ClaudeOneShotParams,
): Promise<string> {
  // Same read-side scope refusal a turn applies (see `./scope-guard`): this path
  // pins the same pod-shared `CLAUDE_CONFIG_DIR`, so a personal scope with no
  // personal token would authenticate as the team and let the SDK self-refresh
  // the team's credential. Decided before the SDK is imported or the env built,
  // reading the credential exactly once. Its mid-flight sibling — the isolated
  // credential store that keeps a 401 from recovering onto the team account —
  // rides `buildClaudeEnv` below.
  const token = p.readToken();
  assertAnthropicScopeCredential(token);

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
    env: buildClaudeEnv(
      claudeLoginConfigDir(),
      token,
      anthropicCredentialStorageDir(p.dataDir),
    ),
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
