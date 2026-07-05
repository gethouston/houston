import type {
  AuthStorage,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ChatMessage } from "@houston/runtime-client";
import { activeProvider, resolveModel } from "../ai/providers";
import { authStorage, modelRegistry } from "../auth/storage";
import { ClaudeBackendUnavailableError } from "../backends/claude/backend";
import { readAnthropicToken } from "../backends/claude/read-token";
import { titleWithClaude } from "../backends/claude/title";
import { config } from "../config";
import { getHistory, renameConversation } from "../store/conversations";
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
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  excerpt: string;
}): Promise<string> {
  const text = await oneShotText({
    cwd: opts.cwd,
    model: opts.model,
    authStorage: opts.authStorage,
    modelRegistry: opts.modelRegistry,
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

/** The concrete runners bound to this workspace's config/credentials. */
function titleRunners(model?: unknown): {
  claude: TitleRunner;
  pi: TitleRunner;
} {
  return {
    claude: (excerpt) => claudeTitle(excerpt),
    pi: (excerpt) =>
      generateTitle({
        cwd: config.workspaceDir,
        model: model ?? resolveModel(),
        authStorage,
        modelRegistry,
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
async function claudeTitle(excerpt: string): Promise<string> {
  try {
    return await titleWithClaude({
      excerpt,
      titlePrompt: TITLE_PROMPT,
      workspaceDir: config.workspaceDir,
      dataDir: config.dataDir,
      readToken: () => readAnthropicToken(authStorage),
      modelId: resolveModel().id,
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

  const title = await dispatchTitle(
    activeProvider(),
    buildExcerpt(history.messages),
    titleRunners(model),
  );
  if (!title) return null;
  renameConversation(id, title);
  return title;
}
