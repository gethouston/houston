/**
 * The app's one `SetupGreetingRegistry` plus the hook the chat panel reads.
 *
 * `lib/agent-first-day.ts` records a self-setup mission here the instant the
 * host starts one, and `hooks/use-setup-hello.ts` reads the record back while it
 * lasts (see `lib/setup-mission-greeting.ts` for why the record exists and what
 * takes over afterwards).
 *
 * The localStorage mirror is what carries the record through a reload during
 * the agent's pod cold start. Losing it only costs the record — the hello still
 * derives from the agent's job description — so a broken mirror reports and the
 * flow continues.
 */

import { useSyncExternalStore } from "react";
import { reportError } from "../lib/error-report";
import {
  type SetupGreetingEntry,
  SetupGreetingRegistry,
} from "../lib/setup-mission-greeting";

const STORAGE_KEY = "houston.setup-greeting";

const registry = new SetupGreetingRegistry({
  now: () => Date.now(),
  read: () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      reportError("setup_greeting_storage", "reading the mirror failed", e);
      return null;
    }
  },
  write: (raw) => {
    try {
      if (raw === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, raw);
    } catch (e) {
      reportError("setup_greeting_storage", "writing the mirror failed", e);
    }
  },
});

export function registerSetupGreeting(
  entry: Omit<SetupGreetingEntry, "registeredAt">,
): void {
  registry.register(entry);
}

/**
 * The creation-time record for this conversation, or null when there is none
 * (any other chat, another device, or a record past its TTL).
 */
export function useSetupGreeting(
  agentPath: string | null | undefined,
  sessionKey: string | null | undefined,
): SetupGreetingEntry | null {
  return useSyncExternalStore(
    (cb) => registry.subscribe(cb),
    () =>
      agentPath && sessionKey ? registry.get(agentPath, sessionKey) : null,
  );
}
