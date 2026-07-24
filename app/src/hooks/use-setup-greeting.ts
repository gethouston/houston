/**
 * The app's one `SetupGreetingRegistry` (HOU-867) plus the hook the chat
 * panel reads. `registerSetupGreeting` is called when the self-setup mission
 * starts (`lib/agent-setup-mission.ts`); the panel appends the derived hello
 * while the conversation is registered, the reveal beat has passed, and the
 * agent hasn't produced any output of its own yet (that last check is the
 * panel's, against the live feed).
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { reportError } from "../lib/error-toast";
import {
  type SetupGreetingEntry,
  SetupGreetingRegistry,
} from "../lib/setup-mission-greeting";

const STORAGE_KEY = "houston.setup-greeting";

/** localStorage, surfaced to Sentry — a broken mirror only costs the hello
 *  after a relaunch, but it must not stay invisible in beta. */
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
 * The agent name to greet with for this conversation, or null (not a setup
 * mission, still inside the reveal beat, or stale). Flips to the name on its
 * own when the beat elapses.
 */
export function useSetupGreetingName(
  agentPath: string | null | undefined,
  sessionKey: string | null | undefined,
): string | null {
  const entry = useSyncExternalStore(
    (cb) => registry.subscribe(cb),
    () =>
      agentPath && sessionKey ? registry.get(agentPath, sessionKey) : null,
  );
  const [revealed, setRevealed] = useState(
    () => !!entry && registry.revealDelayRemaining(entry) === 0,
  );
  useEffect(() => {
    if (!entry) return;
    const remaining = registry.revealDelayRemaining(entry);
    if (remaining === 0) {
      setRevealed(true);
      return;
    }
    setRevealed(false);
    const timer = setTimeout(() => setRevealed(true), remaining);
    return () => clearTimeout(timer);
  }, [entry]);
  return entry && revealed ? entry.agentName : null;
}
