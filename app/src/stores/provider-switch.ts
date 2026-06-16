/**
 * Staged provider-switch handoffs, keyed by conversation.
 *
 * When the user switches a live conversation to a different provider, the
 * model picker stages a handoff here (the chosen `mode` + the provider being
 * left). The next send for that conversation reads it (`peekPending`) and
 * forwards it to the engine as `providerSwitch`. It is cleared (`clearPending`)
 * only when the engine confirms the switch by emitting the `provider_switched`
 * boundary divider — so a switch whose seed FAILS stays staged and the next
 * send retries it, rather than silently continuing on a blank/stale session.
 *
 * This mirrors how autocompact is centralized in `tauriChat.send`: a
 * cross-cutting send concern read from a store so every send path inherits it.
 */
import { create } from "zustand";
import type { ProviderHandoffMode } from "../lib/provider-switch";

export interface PendingHandoff {
  mode: ProviderHandoffMode;
  /** Provider id the conversation is being switched away FROM. */
  fromProvider: string;
}

interface ProviderSwitchState {
  pending: Record<string, PendingHandoff>;
  setPending: (
    agentPath: string,
    sessionKey: string,
    handoff: PendingHandoff,
  ) => void;
  /** Read the staged handoff without clearing it. */
  peekPending: (
    agentPath: string,
    sessionKey: string,
  ) => PendingHandoff | undefined;
  /** Clear the staged handoff once the switch has landed (or been abandoned). */
  clearPending: (agentPath: string, sessionKey: string) => void;
}

function handoffKey(agentPath: string, sessionKey: string): string {
  return `${agentPath}::${sessionKey}`;
}

export const useProviderSwitchStore = create<ProviderSwitchState>(
  (set, get) => ({
    pending: {},
    setPending: (agentPath, sessionKey, handoff) =>
      set((s) => ({
        pending: { ...s.pending, [handoffKey(agentPath, sessionKey)]: handoff },
      })),
    peekPending: (agentPath, sessionKey) =>
      get().pending[handoffKey(agentPath, sessionKey)],
    clearPending: (agentPath, sessionKey) =>
      set((s) => {
        const k = handoffKey(agentPath, sessionKey);
        if (!(k in s.pending)) return s;
        const next = { ...s.pending };
        delete next[k];
        return { pending: next };
      }),
  }),
);
