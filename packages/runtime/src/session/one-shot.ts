import {
  type AgentSessionEvent,
  type AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  type ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { PiThinkingLevel } from "../ai/effort";

export interface OneShotOptions {
  cwd: string;
  model: unknown;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  systemPrompt: string;
  prompt: string;
  /** Reasoning level for the turn. Omit to leave pi's own default in place
   *  (settings-dependent), pass one to pin it — pi clamps to the model. */
  thinkingLevel?: PiThinkingLevel;
}

/**
 * Run a single tool-less prompt through a throwaway pi session and return the
 * assistant's full text. Reuses the same pi auth machinery as chat (in-memory
 * session state, bare loader) so every provider/OAuth flavor behaves exactly
 * like a normal turn instead of needing per-provider completion plumbing.
 * Powers the title summarizer and Create-with-AI instruction generation.
 */
export async function oneShotText(opts: OneShotOptions): Promise<string> {
  const loader = new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: opts.cwd,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: opts.systemPrompt,
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
    ...(opts.thinkingLevel ? { thinkingLevel: opts.thinkingLevel } : {}),
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
    await session.prompt(opts.prompt);
  } finally {
    unsub();
    session.dispose();
  }

  return text;
}
