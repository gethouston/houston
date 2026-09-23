import type { InteractionStep } from "@houston/protocol";
import type { StepperState } from "@houston-ai/chat";
import { useCallback, useEffect, useRef, useState } from "react";
import { hydrateParkedState } from "../lib/interaction-draft-hydrate";
import { restoreInteractionOutcomes } from "../lib/interaction-outcomes-restore";
import {
  useInteractionDraftStore,
  useParkedInteraction,
} from "../stores/interaction-drafts";
import {
  createInteractionOutcomes,
  type InteractionOutcomes,
} from "./chat-interaction-reply";

export interface ParkedInteractionCard {
  /** The outcome log THIS mounted card owns: the step cards close over it, and
   *  it lives exactly as long as the component the hook is called from. */
  outcomes: InteractionOutcomes;
  /** The stepper state to render — `undefined` for a card nothing was parked
   *  for, which then runs on the stepper's own internal state. */
  state: StepperState | undefined;
  onStateChange: (state: StepperState) => void;
  /** False once this card is unmounted. Every callback the card handed out
   *  must check it before acting — see the hook's note on outliving flows. */
  isLive: () => boolean;
}

/**
 * Bind ONE mounted interaction card to the conversation's parked state
 * (PRODUCT-1902).
 *
 * The card replaces the composer, and that override is torn down when the user
 * opens another mission — so how far they walked, what they answered, what each
 * step ended up as, and the free-text typed on every step are parked per
 * conversation exactly like the composer's own text, and handed back on return.
 *
 * Everything is seeded in the state INITIALIZERS, before any child renders:
 * hydration in a parent effect would run after the children's, so a connect step
 * that auto-advances on mount would park first and then be overwritten by a
 * stale seed. Both seeds are read exactly once per mounted card, so a later
 * store write (this hook's own) can never restore over what the user just did.
 *
 * Hydration strips every committed answer on a step carrying a `requestId`: an
 * approval decides one exact host-issued request, so it is always re-confirmed
 * after a return rather than replayed (see {@link hydrateParkedState}).
 *
 * A step's flow can deliberately outlive the card that started it — an
 * integration connect finishes in the browser, and its `await` resolves long
 * after the user opened another mission. Whatever it calls back into belongs to
 * a card that is gone, so `isLive` gates both this hook's own transitions and
 * the completion the card reports: a dead instance must neither park its stale
 * state over the returning one's nor send its reply.
 *
 * Retiring the parked state is NOT this hook's job: completion and dismissal
 * both fire before the send or the dismiss is known to have landed, so clearing
 * here would lose the card on a refusal. It is retired at the two definitive
 * seams instead — server evidence that a turn took the conversation
 * (`interaction-draft-retire.ts`) and a confirmed dismiss.
 */
export function useParkedInteractionCard(args: {
  /** The conversation the card belongs to, `null` before its id lands (nothing
   *  can be parked then). */
  sessionKey: string | null;
  /** Identity of THIS pending interaction (`interactionDraftKey`), so one
   *  card's half-walked answers never hydrate a different card. */
  identity: string;
  /** The RAW wire steps behind `identity` — hydration reads each step's
   *  `requestId`, which a surface's localized rendering does not carry. */
  steps: readonly InteractionStep[];
}): ParkedInteractionCard {
  const { sessionKey, identity, steps } = args;
  const parked = useParkedInteraction(sessionKey, identity);

  const [outcomes] = useState(() => {
    const log = createInteractionOutcomes();
    // A restored position past a skipped connect step must still compose a
    // reply that mentions the skip, so the log is refilled before any step card
    // can read it.
    if (parked) restoreInteractionOutcomes(log, parked.outcomes);
    return log;
  });
  // What this mount found parked, and the approval-stripped state to run on.
  // `hydrateParkedState` hands back the same reference when it dropped nothing,
  // so `changed` is exactly "the store still holds something unsafe to replay".
  const [seed] = useState(() => {
    const state = parked ? hydrateParkedState(parked.state, steps) : undefined;
    return {
      source: parked,
      state,
      changed: parked !== undefined && state !== parked.state,
    };
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design — the seed is what was parked when this card mounted, and this very effect writes the `parked` it would otherwise re-read.
  useEffect(() => {
    if (!sessionKey || !seed.changed || !seed.state) return;
    // A child that parked during its own mount wrote the newer truth; its entry
    // must not be overwritten by this seed.
    if (useInteractionDraftStore.getState().parked[sessionKey] !== seed.source)
      return;
    useInteractionDraftStore
      .getState()
      .park(sessionKey, { key: identity, state: seed.state, outcomes });
  }, []);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const isLive = useCallback(() => alive.current, []);

  const onStateChange = useCallback(
    (state: StepperState) => {
      if (!sessionKey || !alive.current) return;
      useInteractionDraftStore
        .getState()
        .park(sessionKey, { key: identity, state, outcomes });
    },
    [identity, outcomes, sessionKey],
  );

  // The stored reference is stable until the first write, so this equality holds
  // exactly until the mount effect (or a transition) parks the hydrated state;
  // from then on the store itself carries it.
  const state = parked === seed.source ? seed.state : parked?.state;
  return { outcomes, state, onStateChange, isLive };
}
