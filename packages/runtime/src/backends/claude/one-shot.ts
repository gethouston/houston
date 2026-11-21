import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeToken } from "./backend-types";
import { resolveClaudeExecutable } from "./binary-path";
import { buildClaudeEnv } from "./claude-env";
import { CREDENTIAL_PERMISSION_RULES } from "./credential-rules";
import { denyEveryTool } from "./file-guard-hook";
import { toSdkModel } from "./model";
import { claudeLoginConfigDir } from "./paths";
import { CLAUDE_QUERY_DEFAULTS } from "./query-defaults";
import {
  anthropicCredentialStorageDir,
  assertAnthropicScopeCredential,
} from "./scope-guard";
import {
  ClaudeBackendUnavailableError,
  loadedClaudeSdk,
  preloadClaudeSdk,
} from "./sdk-loader";
import type { ClaudeQuery } from "./session";
import { createStreamTranslator } from "./translate";

export interface ClaudeOneShotParams {
  prompt: string;
  systemPrompt: string;
  workspaceDir: string;
  readToken: () => ClaudeToken | undefined;
  dataDir?: string;
  modelId?: string;
  query?: ClaudeQuery;
  signal?: AbortSignal;
}

export async function oneShotWithClaude(
  p: ClaudeOneShotParams,
): Promise<string> {
  const token = p.readToken();
  assertAnthropicScopeCredential(token);

  let query = p.query;
  if (!query) {
    try {
      query = (await loadedClaudeSdk(preloadClaudeSdk())).query;
    } catch (err) {
      throw new ClaudeBackendUnavailableError(err);
    }
  }

  const pathToClaudeCodeExecutable = resolveClaudeExecutable();
  const options: Options = {
    cwd: p.workspaceDir,
    env: buildClaudeEnv(token, {
      configDir: claudeLoginConfigDir(),
      credentialStorageDir: anthropicCredentialStorageDir(p.dataDir),
    }),
    ...(pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable } : {}),
    ...CLAUDE_QUERY_DEFAULTS,
    tools: [],
    allowedTools: [],
    disallowedTools: [...CREDENTIAL_PERMISSION_RULES],
    hooks: { PreToolUse: [{ hooks: [denyEveryTool] }] },
    systemPrompt: p.systemPrompt,
    ...(p.modelId ? { model: toSdkModel(p.modelId) } : {}),
    ...(p.signal ? { abortController: abortControllerFor(p.signal) } : {}),
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

function abortControllerFor(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  else
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  return controller;
}
