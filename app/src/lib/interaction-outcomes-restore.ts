import type { InteractionOutcomes } from "../components/chat-interaction-reply.ts";

export function restoreInteractionOutcomes(
  target: InteractionOutcomes,
  source: InteractionOutcomes,
): void {
  refill(target.connects, source.connects);
  refill(target.credentials, source.credentials);
  refill(target.handsOn, source.handsOn);
  refill(target.credentialModes, source.credentialModes);
  target.signin = source.signin;
  target.signinDeclineText = source.signinDeclineText;
}

function refill<T>(target: Map<string, T>, source: Map<string, T>): void {
  target.clear();
  for (const [id, outcome] of source) target.set(id, outcome);
}
