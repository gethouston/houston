import type { InteractionStep } from "@houston/protocol";
import type { StepperState } from "@houston-ai/chat";
import { create } from "zustand";
import type { InteractionOutcomes } from "../components/chat-interaction-reply.ts";
import { canonicalJson } from "../lib/canonical-json.ts";

/**
 * The in-chat interaction card a conversation is half-way through: how far the
 * user walked, what they answered, what they typed, and what each connect /
 * credential / hands-on step ended up as.
 *
 * `key` is the interaction it belongs to ({@link interactionDraftKey}), since a
 * pending interaction has no id of its own. `outcomes` is the mounted card's
 * LIVE log by reference — only that card writes to it, and the next mount
 * copies it into its own log (`restoreInteractionOutcomes`).
 */
export interface ParkedInteraction {
  key: string;
  state: StepperState;
  outcomes: InteractionOutcomes;
}

interface InteractionDraftsState {
  /** Parked cards keyed by session key, exactly like the composer's drafts. */
  parked: Record<string, ParkedInteraction>;
  park: (sessionKey: string, parked: ParkedInteraction) => void;
  /** Forget this session's card entirely — it was sent, dismissed or deleted. */
  clear: (sessionKey: string) => void;
  /** Drop everything — the outgoing account's half-answered cards are private
   *  to it (identity change, HOU-903). */
  reset: () => void;
}

/**
 * Where a half-walked in-chat interaction waits while the user is elsewhere
 * (PRODUCT-1902).
 *
 * A slice of its own rather than a field on `useDraftStore`: the board
 * subscribes to that store's whole draft map, so parking the card there would
 * repaint every board tile on each keystroke inside the card.
 *
 * Lifecycle mirrors the composer draft store seam for seam — cleared with the
 * conversation, with the agent, and with the signed-in identity — plus the turn
 * seam: once a turn starts on a conversation, its card answers a dead question,
 * so the card is retired on PROOF that one did (`interaction-draft-retire.ts`)
 * — a frame only a live turn produces, or a `completed` settle. A turn run
 * entirely elsewhere retires its card when the user reopens that conversation
 * and the attached observer replays it.
 */
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

/** The parked card when it is THIS interaction's, else undefined: one card's
 *  answers must never hydrate another's. */
export function parkedInteractionFor(
  entry: ParkedInteraction | undefined,
  key: string,
): ParkedInteraction | undefined {
  return entry?.key === key ? entry : undefined;
}

/** Read-only selector for a session's parked card. Hands back the STORED
 *  object, so a render that changed nothing sees no new identity. */
export function useParkedInteraction(
  sessionKey: string | null,
  key: string,
): ParkedInteraction | undefined {
  return useInteractionDraftStore((s) =>
    sessionKey ? parkedInteractionFor(s.parked[sessionKey], key) : undefined,
  );
}

/**
 * A stable identity for a pending interaction, which carries no id of its own:
 * its FULL wire content, canonically serialized.
 *
 * Nothing smaller is safe. Two interactions can share every step id and every
 * word and still be different requests — an approval step's `requestId` binds
 * it to one exact host-issued call, and its `detail` / `options` / `approval`
 * args are what the user actually read before clicking. Keying on less would
 * let one card's "approve" hydrate the next card and decide an operation the
 * user was never shown. For the same reason the FULL string is the key, here
 * and as the card's React key: a hash would collide two different interactions
 * onto one card instance.
 *
 * Canonical because the same interaction reaches the card from two sources —
 * the live conversation VM and the persisted activity (`deriveActiveInteraction`)
 * — each having built its objects its own way. Property order is the one
 * difference that must not split one interaction into two cards.
 */
export function interactionDraftKey(steps: readonly InteractionStep[]): string {
  return canonicalJson(steps);
}
