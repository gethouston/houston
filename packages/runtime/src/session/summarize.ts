import {
  type AgentSessionEvent,
  type AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  type ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { ChatMessage } from "@houston/runtime-client";
import { resolveModel } from "../ai/providers";
import { authStorage, modelRegistry } from "../auth/storage";
import { config } from "../config";
import { getHistory, renameConversation } from "../store/conversations";

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
 * Pure, parameterized title generation. Reuses the same pi auth machinery as
 * chat (one throwaway session: no tools, in-memory session state, bare loader)
 * so every provider/OAuth flavor behaves exactly like a normal turn instead of
 * needing per-provider completion plumbing.
 */
export async function generateTitle(opts: {
  cwd: string;
  model: unknown;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  excerpt: string;
}): Promise<string> {
  const loader = new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: opts.cwd,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: TITLE_PROMPT,
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: opts.cwd,
    agentDir: opts.cwd,
    model: opts.model as never,
    authStorage: opts.authStorage,
    modelRegistry: opts.modelRegistry,
    sessionManager: SessionManager.inMemory(opts.cwd),
    resourceLoader: loader,
    tools: [],
  });

  let text = "";
  const unsub = session.subscribe((e: AgentSessionEvent) => {
    if (
      e.type === "message_update" &&
      e.assistantMessageEvent?.type === "text_delta"
    ) {
      text += e.assistantMessageEvent.delta ?? "";
    }
  });
  try {
    await session.prompt(opts.excerpt);
  } finally {
    unsub();
    session.dispose();
  }

  return text.trim().split("\n")[0]?.trim().slice(0, 80) ?? "";
}

/**
 * Title an arbitrary excerpt (the composer's first message), independent of any
 * stored conversation. Powers the adapter's `summarizeActivity(message)` —
 * which has the message text but no conversation id — so a board mission gets a
 * real LLM title instead of a client-side truncation. Returns "" for empty
 * input or when the model emits nothing (the caller falls back to truncation).
 */
export async function titleFromText(
  text: string,
  model = resolveModel(),
): Promise<string> {
  const excerpt = text.trim().slice(0, 2400);
  if (!excerpt) return "";
  return generateTitle({
    cwd: config.workspaceDir,
    model,
    authStorage,
    modelRegistry,
    excerpt,
  });
}

/**
 * Summarize a conversation into a short title and persist it. Returns the new
 * title, or null when the conversation does not exist or is empty.
 */
export async function summarizeTitle(
  id: string,
  model = resolveModel(),
): Promise<string | null> {
  const history = getHistory(id);
  if (!history || history.messages.length === 0) return null;

  const title = await generateTitle({
    cwd: config.workspaceDir,
    model,
    authStorage,
    modelRegistry,
    excerpt: buildExcerpt(history.messages),
  });
  if (!title) return null;
  renameConversation(id, title);
  return title;
}
