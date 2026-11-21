import type { AssistantHandle } from "@houston/engine-adapter";
import { classifyAssistantDiscoveryFailure } from "./assistant-availability.ts";

export type AssistantFailure = "transient" | "unexpected";

export interface AssistantDiscovery {
  handle: AssistantHandle | null;
  isLoading: boolean;
  unavailable: boolean;
  failure: AssistantFailure | null;
}

export interface AssistantQueryState {
  enabled: boolean;
  handle: AssistantHandle | null;
  error: unknown;
}

export function assistantDiscoveryState(
  state: AssistantQueryState,
): AssistantDiscovery {
  const { enabled, handle, error } = state;
  if (!enabled)
    return { handle: null, isLoading: false, unavailable: true, failure: null };
  if (handle)
    return { handle, isLoading: false, unavailable: false, failure: null };
  if (!error)
    return { handle: null, isLoading: true, unavailable: false, failure: null };
  const { kind } = classifyAssistantDiscoveryFailure(error);
  const unavailable = kind === "unsupported";
  return {
    handle: null,
    isLoading: false,
    unavailable,
    failure: unavailable ? null : kind,
  };
}
