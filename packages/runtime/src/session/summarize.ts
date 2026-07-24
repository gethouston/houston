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

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const TITLE_PROMPT = [
  "You generate conversation titles.",
  "Reply with ONLY a title of 3 to 6 plain words for the conversation excerpt the user sends.",
  "No quotes, no trailing punctuation, no explanations.",
].join(" ");

/** First turns of the transcript, trimmed to a prompt-sized excerpt. */
export function buildExcerpt(messages: ChatMessage[]): string {
  return messages
    .slice(0, 6)
    .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
    .join("\n")
    .slice(0, 2400);
}

/**
 * Pure, parameterized title generation: a throwaway one-shot turn (see
 * `oneShotText`) trimmed to a single title line.
 */
export async function generateTitle(opts: {
  cwd: string;
  model: unknown;
  modelRuntime: ModelRuntime;
  excerpt: string;
}): Promise<string> {
  const text = await oneShotText({
    cwd: opts.cwd,
    model: opts.model,
    modelRuntime: opts.modelRuntime,
    systemPrompt: TITLE_PROMPT,
    prompt: opts.excerpt,
  });
  return text.trim().split("\n")[0]?.trim().slice(0, 80) ?? "";
}

/** Produce a title for an excerpt (one provider's title implementation). */
export type TitleRunner = (excerpt: string) => Promise<string>;

/**
 * COMPLIANCE GATE (titles): route the title the SAME way a turn routes. When the
 * active provider is `anthropic` the title runs through the Claude Agent SDK —
 * NEVER pi's `createAgentSession`, which would hit api.anthropic.com in-process
 * with the setup token, the harness-spoofing path Anthropic server-blocks. Every
 * other provider keeps the existing pi title path byte-identical. Pure (the
 * runners are injected) so the "pi is not invoked for anthropic" guarantee is
 * unit-tested with spies.
 */
export function dispatchTitle(
  provider: string | null,
  excerpt: string,
  runners: { claude: TitleRunner; pi: TitleRunner },
): Promise<string> {
  return provider === "anthropic"
    ? runners.claude(excerpt)
    : runners.pi(excerpt);
}

/**
 * How to route ONE conversation's title. Titles run on the CONVERSATION's own
 * provider when its session is live (it just ran a turn — the moment titles
 * are requested). Dispatching on the agent-wide active provider titled a
 * local-model chat through a full Claude one-shot: a different backend the
 * chat never picked, burning a real Anthropic call (and failing outright when
 * that provider was the disconnected one). Only when the session is no longer
 * cached does the active provider decide. Pure, so the routing is unit-tested.
 */
export function titlePlan(
  conv: { provider: string; model: string } | undefined,
  active: string | null,
): {
  provider: string | null;
  /** Claude model to title with (anthropic conversations only). */
  claudeModelId?: string;
  /** Model pin the pi runner must resolve (non-anthropic conversations). */
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

/** The concrete runners bound to this workspace's config/credentials. */
function titleRunners(
  model?: unknown,
  claudeModelId?: string,
): {
  claude: TitleRunner;
  pi: TitleRunner;
} {
  return {
    claude: (excerpt) => claudeTitle(excerpt, claudeModelId),
    pi: (excerpt) =>
      generateTitle({
        cwd: config.workspaceDir,
        model: model ?? resolveModel(),
        modelRuntime,
        excerpt,
      }),
  };
}

/**
 * The anthropic title runner: a one-shot Claude SDK query. The ONLY expected
 * failure is the optional SDK being absent from this build; degrade to no title
 * (the caller truncates) rather than reroute an anthropic title onto pi's client
 * — that reroute is precisely what the compliance gate forbids.
 */
async function claudeTitle(excerpt: string, modelId?: string): Promise<string> {
  try {
    return await titleWithClaude({
      excerpt,
      titlePrompt: TITLE_PROMPT,
      workspaceDir: config.workspaceDir,
      readToken: () => readAnthropicToken(authStorage),
      modelId: modelId ?? resolveModel().id,
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

/**
 * Title an arbitrary excerpt (the composer's first message), independent of any
 * stored conversation. Powers the adapter's `summarizeActivity(message)` —
 * which has the message text but no conversation id — so a board mission gets a
 * real LLM title instead of a client-side truncation. Returns "" for empty
 * input or when the model emits nothing (the caller falls back to truncation).
 *
 * The model is resolved LAZILY (only once we know there is text to title), so
 * empty input returns "" even when no provider is connected — resolving it in a
 * default-param argument would throw "No provider connected" before the
 * empty-input short-circuit could run.
 */
export async function titleFromText(
  text: string,
  model?: unknown,
): Promise<string> {
  const excerpt = text.trim().slice(0, 2400);
  if (!excerpt) return "";
  return dispatchTitle(activeProvider(), excerpt, titleRunners(model));
}

/**
 * Summarize a conversation into a short title and persist it. Returns the new
 * title, or null when the conversation does not exist or is empty. The model is
 * resolved LAZILY (after the existence check) so a missing/empty conversation
 * returns null even when no provider is connected.
 */
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
      // The chat's provider is disconnected (e.g. its local endpoint is
      // gone): no title rather than silently rerouting onto a provider the
      // chat never chose — the caller falls back to truncation.
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
