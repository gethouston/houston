import type { InteractionStep } from "@houston/protocol";
import type { StepperState } from "@houston-ai/chat";

/**
 * Make a parked card safe to restore: an approval the user clicked before the
 * card was torn down is UNCOMMITTED, and the stepper rewound to it.
 *
 * A step carrying a `requestId` decides one exact host-issued request and is
 * never deduped against another (`@houston/protocol` interaction types), so a
 * committed "approve" may not survive a remount — the request it answered is
 * gone, and replaying it would approve an operation nobody was shown. The
 * frontier rewinds to the first such step so the user walks up to it again and
 * clicks for the request actually in front of them; typed drafts are kept,
 * since text the user wrote is theirs either way.
 *
 * Returns the given state untouched when no approval was committed, so a
 * restore that changes nothing costs no render.
 */
export function hydrateParkedState(
  state: StepperState,
  steps: readonly InteractionStep[],
): StepperState {
  const dropped = new Set<string>();
  let firstDropped = -1;
  steps.forEach((step, index) => {
    if (step.kind !== "question" || step.requestId === undefined) return;
    if (state.answers[step.id] === undefined) return;
    dropped.add(step.id);
    if (firstDropped === -1) firstDropped = index;
  });
  if (firstDropped === -1) return state;
  const answers = { ...state.answers };
  for (const id of dropped) delete answers[id];
  const reached = Math.min(state.reached, firstDropped);
  return {
    current: Math.min(state.current, reached),
    reached,
    answers,
    drafts: state.drafts,
  };
}
