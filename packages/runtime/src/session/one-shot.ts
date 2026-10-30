import type { Transport } from "@earendil-works/pi-ai";
import {
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  type ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { PiThinkingLevel } from "../ai/effort";
import { isManagedBridgeModel } from "../ai/openai-compatible-model";
import { createPiCallTimer } from "../backends/pi/model-calls";
import type { HarnessTimingEvent } from "../backends/types";

export interface OneShotOptions {
  cwd: string;
  model: unknown;
  modelRuntime: ModelRuntime;
  systemPrompt: string;
  prompt: string;
  /** Reasoning level for the turn. Omit to leave pi's own default in place
   *  (settings-dependent), pass one to pin it — pi clamps to the model. */
  thinkingLevel?: PiThinkingLevel;
  /** Aborts the in-flight prompt (a caller's time cap). */
  signal?: AbortSignal;
  /** pi's provider transport. Omit for pi's own setting (`auto`). */
  transport?: Transport;
  autoRetry?: boolean;
  onModelCall?: (event: HarnessTimingEvent) => void;
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

  // A throwaway request must not persist retry or model settings in the workspace.
  const settingsManager = SettingsManager.inMemory(
    SettingsManager.create(opts.cwd, opts.cwd).getSettings(),
  );
  if (opts.transport)
    settingsManager.applyOverrides({ transport: opts.transport });
  const { session } = await createAgentSession({
    cwd: opts.cwd,
    agentDir: opts.cwd,
    model: opts.model as never,
    modelRuntime: opts.modelRuntime,
    sessionManager: SessionManager.inMemory(opts.cwd),
    resourceLoader: loader,
    settingsManager,
    tools: [],
    ...(opts.thinkingLevel ? { thinkingLevel: opts.thinkingLevel } : {}),
  });

  if (opts.autoRetry === false || isManagedBridgeModel(opts.model))
    session.setAutoRetryEnabled(false);
  let text = "";
  const timer = createPiCallTimer();
  const unsub = session.subscribe((e: AgentSessionEvent) => {
    const call = timer(e);
    if (call) opts.onModelCall?.({ type: "call", call });
    if (
      e.type === "message_update" &&
      e.assistantMessageEvent?.type === "text_delta"
    ) {
      text += e.assistantMessageEvent.delta ?? "";
    }
  });
  const onAbort = () => void session.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (!opts.signal?.aborted) await session.prompt(opts.prompt);
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
    unsub();
    session.dispose();
  }

  return text;
}
