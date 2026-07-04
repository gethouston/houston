import type {
  AuthStorage,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ChatMessage } from "@houston/runtime-client";
import { resolveModel } from "../ai/providers";
import { authStorage, modelRegistry } from "../auth/storage";
import { config } from "../config";
import { getHistory, renameConversation } from "../store/conversations";
import { runOneShot } from "./oneshot";

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
 * Pure, parameterized title generation on the shared one-shot runner
 * (`oneshot.ts`) — a throwaway tool-less pi session, so every provider/OAuth
 * flavor behaves exactly like a normal turn.
 */
export async function generateTitle(opts: {
  cwd: string;
  model: unknown;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  excerpt: string;
}): Promise<string> {
  const text = await runOneShot({
    cwd: opts.cwd,
    model: opts.model,
    authStorage: opts.authStorage,
    modelRegistry: opts.modelRegistry,
    systemPrompt: TITLE_PROMPT,
    prompt: opts.excerpt,
  });
  return text.trim().split("\n")[0]?.trim().slice(0, 80) ?? "";
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
  return generateTitle({
    cwd: config.workspaceDir,
    model: model ?? resolveModel(),
    authStorage,
    modelRegistry,
    excerpt,
  });
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

  const title = await generateTitle({
    cwd: config.workspaceDir,
    model: model ?? resolveModel(),
    authStorage,
    modelRegistry,
    excerpt: buildExcerpt(history.messages),
  });
  if (!title) return null;
  renameConversation(id, title);
  return title;
}
