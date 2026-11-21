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
  outcomes: InteractionOutcomes;
  state: StepperState | undefined;
  onStateChange: (state: StepperState) => void;
  isLive: () => boolean;
}

export function useParkedInteractionCard(args: {
  sessionKey: string | null;
  identity: string;
  steps: readonly InteractionStep[];
}): ParkedInteractionCard {
  const { sessionKey, identity, steps } = args;
  const parked = useParkedInteraction(sessionKey, identity);

  const [outcomes] = useState(() => {
    const log = createInteractionOutcomes();
    if (parked) restoreInteractionOutcomes(log, parked.outcomes);
    return log;
  });
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

  const state = parked === seed.source ? seed.state : parked?.state;
  return { outcomes, state, onStateChange, isLive };
}
