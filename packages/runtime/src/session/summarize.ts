import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { ChatMessage } from "@houston/runtime-client";
import { activeProvider, resolveModel } from "../ai/providers";
import { authStorage, modelRuntime } from "../auth/storage";
import { ClaudeBackendUnavailableError } from "../backends/claude/backend";
import { readAnthropicToken } from "../backends/claude/read-token";
import { titleWithClaude } from "../backends/claude/title";
import { config } from "../config";
import { getHistory, renameConversation } from "../store/conversations";
import { conversations } from "./conversation-cache";
import { oneShotText } from "./one-shot";
import { TITLE_PROMPT } from "./title-prompt";

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export function buildExcerpt(messages: ChatMessage[]): string {
  return messages
    .slice(0, 6)
    .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
    .join("\n")
    .slice(0, 2400);
}

export async function generateTitle(opts: {
  cwd: string;
  model: unknown;
  modelRuntime: ModelRuntime;
  excerpt: string;
  signal?: AbortSignal;
}): Promise<string> {
  const text = await oneShotText({
    cwd: opts.cwd,
    model: opts.model,
    modelRuntime: opts.modelRuntime,
    systemPrompt: TITLE_PROMPT,
    prompt: opts.excerpt,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  return text.trim().split("\n")[0]?.trim().slice(0, 80) ?? "";
}

export type TitleRunner = (excerpt: string) => Promise<string>;

export function dispatchTitle(
  provider: string | null,
  excerpt: string,
  runners: { claude: TitleRunner; pi: TitleRunner },
): Promise<string> {
  return provider === "anthropic"
    ? runners.claude(excerpt)
    : runners.pi(excerpt);
}

export function titlePlan(
  conv: { provider: string; model: string } | undefined,
  active: string | null,
): {
  provider: string | null;
  claudeModelId?: string;
  resolvePin?: { provider: string; model: string };
} {
  if (!conv) return { provider: active };
  if (conv.provider === "anthropic")
    return { provider: "anthropic", claudeModelId: conv.model };
  return {
    provider: conv.provider,
    resolvePin: { provider: conv.provider, model: conv.model },
  };
}

function titleRunners(
  model?: unknown,
  claudeModelId?: string,
  signal?: AbortSignal,
): {
  claude: TitleRunner;
  pi: TitleRunner;
} {
  return {
    claude: (excerpt) => claudeTitle(excerpt, claudeModelId, signal),
    pi: (excerpt) =>
      generateTitle({
        cwd: config.workspaceDir,
        model: model ?? resolveModel(),
        modelRuntime,
        excerpt,
        ...(signal ? { signal } : {}),
      }),
  };
}

async function claudeTitle(
  excerpt: string,
  modelId?: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    return await titleWithClaude({
      excerpt,
      titlePrompt: TITLE_PROMPT,
      workspaceDir: config.workspaceDir,
      readToken: () => readAnthropicToken(authStorage),
      dataDir: config.dataDir,
      modelId: modelId ?? resolveModel().id,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (err instanceof ClaudeBackendUnavailableError) {
      console.warn(
        `[title] Claude Agent SDK unavailable; skipping anthropic title: ${errMessage(err)}`,
      );
      return "";
    }
    throw err;
  }
}

export async function titleFromText(
  text: string,
  model?: unknown,
): Promise<string> {
  const excerpt = text.trim().slice(0, 2400);
  if (!excerpt) return "";
  return dispatchTitle(activeProvider(), excerpt, titleRunners(model));
}

export function titleWithTurnModel(
  excerpt: string,
  model: { provider: string; id: string },
  signal?: AbortSignal,
): Promise<string> {
  return dispatchTitle(
    model.provider,
    excerpt,
    titleRunners(
      model,
      model.provider === "anthropic" ? model.id : undefined,
      signal,
    ),
  );
}

export async function summarizeTitle(
  id: string,
  model?: unknown,
): Promise<string | null> {
  const history = getHistory(id);
  if (!history || history.messages.length === 0) return null;

  const conv = conversations.get(id);
  const plan = titlePlan(
    conv ? { provider: conv.provider, model: conv.model } : undefined,
    activeProvider(),
  );
  let runnerModel = model;
  if (!model && plan.resolvePin) {
    try {
      runnerModel = resolveModel(
        plan.resolvePin.model,
        plan.resolvePin.provider,
      );
    } catch {
      return null;
    }
  }

  const title = await dispatchTitle(
    plan.provider,
    buildExcerpt(history.messages),
    titleRunners(runnerModel, plan.claudeModelId),
  );
  if (!title) return null;
  renameConversation(id, title);
  return title;
}
