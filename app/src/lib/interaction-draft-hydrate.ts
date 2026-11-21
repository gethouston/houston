import type { InteractionStep } from "@houston/protocol";
import type { StepperState } from "@houston-ai/chat";

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
    ...state,
    current: Math.min(state.current, reached),
    reached,
    answers,
  };
}
