import type { FirstResponse } from "@houston/sdk";
import { reportAdapterError } from "./error-sink";

export interface FirstResponseEvent {
  agentPath: string;
  sessionKey: string;
  response: FirstResponse;
}

type Listener = (event: FirstResponseEvent) => void;

const listeners = new Set<Listener>();

export function subscribeFirstResponses(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishFirstResponse(event: FirstResponseEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (e) {
      reportAdapterError("first_response_listener", e);
    }
  }
}
