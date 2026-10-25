import type {
  AgentSession,
  AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { SentRequests } from "../backends/pi/model-phase";
import { PiSession } from "../backends/pi/session";

export function ceilingPi(input: {
  prompt: (emit: (event: AgentSessionEvent) => void) => Promise<void>;
  abort: (emit: (event: AgentSessionEvent) => void) => void;
}) {
  const listeners = new Set<(event: AgentSessionEvent) => void>();
  const emit = (event: AgentSessionEvent) => {
    for (const listener of listeners) listener(event);
  };
  const raw = {
    subscribe(listener: (event: AgentSessionEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    prompt: () => input.prompt(emit),
    abort: async () => input.abort(emit),
    dispose: () => {},
    getContextUsage: () => undefined,
    getActiveToolNames: () => [],
    messages: [],
  };
  return new PiSession(raw as unknown as AgentSession, new SentRequests());
}

export const piEvent = (event: unknown) => event as AgentSessionEvent;
export const piFailure = (message: string) =>
  piEvent({
    type: "turn_end",
    toolResults: [],
    message: {
      role: "assistant",
      content: [],
      api: "openai-responses",
      provider: "openai-codex",
      model: "test",
      stopReason: "error",
      errorMessage: message,
      timestamp: Date.now(),
      usage: {
        input: 1,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    },
  });
export const piText = piEvent({
  type: "message_update",
  assistantMessageEvent: { type: "text_delta", delta: "Saved work" },
});
