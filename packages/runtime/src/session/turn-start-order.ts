import { canonicalPinProvider, isProvider } from "../ai/providers";
import { serveModeOn } from "../auth/serve";
import { conversations } from "./conversation-cache";
import type { TurnPin } from "./exec-turn";
import { pinnedProviderUnavailable } from "./provider-gate";
import {
  type CardAnswer,
  refuseQueuedCardAnswer,
  reportPinnedProviderUnavailable,
  type TurnStartFailure,
} from "./turn-start-failure";

export function inTurnOrder(
  failure: TurnStartFailure,
  answer: CardAnswer | undefined,
  write: () => void,
): Promise<void> {
  const step = () => {
    if (!refuseQueuedCardAnswer(failure.id, failure.turnId, answer)) write();
  };
  const conv = conversations.get(failure.id);
  if (!conv) {
    step();
    return Promise.resolve();
  }
  const run = conv.queue.then(step);
  conv.queue = run.catch(() => {});
  return run;
}

export async function refusePinnedProvider(
  failure: TurnStartFailure,
  pin: TurnPin | undefined,
  answer: CardAnswer | undefined,
): Promise<boolean> {
  const provider = pin?.provider ? canonicalPinProvider(pin.provider) : null;
  if (
    !serveModeOn() ||
    !provider ||
    !isProvider(provider) ||
    !(await pinnedProviderUnavailable(provider))
  )
    return false;
  await inTurnOrder(failure, answer, () =>
    reportPinnedProviderUnavailable(failure, provider),
  );
  return true;
}
