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
  thinkingLevel?: PiThinkingLevel;
  signal?: AbortSignal;
  transport?: Transport;
  autoRetry?: boolean;
  onModelCall?: (event: HarnessTimingEvent) => void;
}

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
