import {
  type AgentSessionEvent,
  type AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  type ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

export interface OneShotOptions {
  cwd: string;
  model: unknown;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  systemPrompt: string;
  prompt: string;
  /** Abort the run if the model hasn't finished by then. Absent = no cap. */
  timeoutMs?: number;
}

/**
 * One tool-less, in-memory pi prompt → the assistant's raw text. Reuses the
 * same pi auth machinery as chat (throwaway session: no tools, in-memory
 * session state, bare loader) so every provider/OAuth flavor behaves exactly
 * like a normal turn instead of needing per-provider completion plumbing.
 * Powers title summarization and instruction generation.
 */
export async function runOneShot(opts: OneShotOptions): Promise<string> {
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
  const timer =
    opts.timeoutMs !== undefined
      ? setTimeout(() => void session.abort(), opts.timeoutMs)
      : undefined;
  try {
    await session.prompt(opts.prompt);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    unsub();
    session.dispose();
  }

  return text;
}
