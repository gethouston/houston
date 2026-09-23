import type { InteractionOutcomes } from "../components/chat-interaction-reply.ts";

/**
 * Copy a walked interaction's outcome log into the log a remounted card owns
 * (PRODUCT-1902).
 *
 * The log is a set of Maps the step cards close over, minted once per mounted
 * card; a remount mints a fresh one, and a restored position past a skipped
 * connect step would then compose a reply that never mentions the skip. The
 * parked value is the log OBJECT itself, not a copy of it: only the mounted
 * card mutates a log, and the next mount copies it here, so a per-keystroke
 * flattening would duplicate four Maps for nothing.
 *
 * REPLACES whatever `target` held: a restore is the whole truth about a
 * sequence, so a stale entry left behind would report an outcome the user never
 * produced.
 *
 * It mutates in place rather than returning a new log because the step cards
 * already close over `target`'s Maps — handing back a different object would
 * leave every card writing into the log nobody reads.
 */
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
