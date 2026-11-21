import type { InteractionStep } from "@houston/protocol";
import type { StepperState } from "@houston-ai/chat";
import { create } from "zustand";
import type { InteractionOutcomes } from "../components/chat-interaction-reply.ts";
import { canonicalJson } from "../lib/canonical-json.ts";

export interface ParkedInteraction {
  key: string;
  state: StepperState;
  outcomes: InteractionOutcomes;
}

interface InteractionDraftsState {
  parked: Record<string, ParkedInteraction>;
  park: (sessionKey: string, parked: ParkedInteraction) => void;
  clear: (sessionKey: string) => void;
  reset: () => void;
}

export const useInteractionDraftStore = create<InteractionDraftsState>(
  (set) => ({
    parked: {},

    park: (sessionKey, parked) =>
      set((s) => ({ parked: { ...s.parked, [sessionKey]: parked } })),

    clear: (sessionKey) =>
      set((s) => {
        if (!(sessionKey in s.parked)) return { parked: s.parked };
        const next = { ...s.parked };
        delete next[sessionKey];
        return { parked: next };
      }),

    reset: () => set({ parked: {} }),
  }),
);

export function parkedInteractionFor(
  entry: ParkedInteraction | undefined,
  key: string,
): ParkedInteraction | undefined {
  return entry?.key === key ? entry : undefined;
}

export function useParkedInteraction(
  sessionKey: string | null,
  key: string,
): ParkedInteraction | undefined {
  return useInteractionDraftStore((s) =>
    sessionKey ? parkedInteractionFor(s.parked[sessionKey], key) : undefined,
  );
}

export function interactionDraftKey(steps: readonly InteractionStep[]): string {
  return canonicalJson(steps);
}
