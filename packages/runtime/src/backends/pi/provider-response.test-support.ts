import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { WireEvent } from "@houston/runtime-client";
import { makeProviderResponseRecorder } from "../../ai/provider-response";
import { toWire } from "./wire";

type Handler = (event: unknown) => unknown;

/**
 * What a pi session does inside its prompt when the provider refuses: the
 * recorder sees the 400 response, then pi's turn_end failure becomes the card.
 * Run it from a fake session's `prompt` to prove the caller wrapped that
 * prompt in the response capture: without the wrap the card has no status.
 */
export function failWithRecordedResponse(): WireEvent | null {
  const handlers: Record<string, Handler> = {};
  makeProviderResponseRecorder()({
    on: (event: string, handler: Handler) => {
      handlers[event] = handler;
    },
  } as never);
  handlers.after_provider_response?.({
    type: "after_provider_response",
    status: 400,
    headers: { "x-oai-request-id": "oai-wrap-1" },
  });
  const message: AssistantMessage = {
    role: "assistant",
    content: [],
    api: "openai-responses",
    provider: "openai",
    model: "gpt-x",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "error",
    errorMessage: "Request failed",
    timestamp: 0,
  };
  return toWire({ type: "turn_end", message, toolResults: [] });
}
