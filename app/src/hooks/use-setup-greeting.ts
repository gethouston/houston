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
