import type { ConnectionEvidence } from "@houston/sdk/provider-connection-observer";

/**
 * Whether a provider-connect card is still looking the provider up for the
 * first time — the one state a spinner belongs in.
 *
 * The observer reports `"checking"` twice over: before the first probe answers,
 * AND after a probe whose read failed. Spun off the state alone, a card whose
 * status call keeps failing spins for as long as it is open and never says
 * anything. So the spinner is tied to the FIRST answer instead: once any
 * evidence has landed, a later failed probe simply leaves the last known answer
 * standing.
 */
export function providerConnectProbing(
  state: ConnectionEvidence,
  hasEvidence: boolean,
): boolean {
  return state === "checking" && !hasEvidence;
}

/** Any state but `"checking"` IS evidence, and evidence is never unseen. */
export function providerConnectEvidenceSeen(
  seen: boolean,
  state: ConnectionEvidence,
): boolean {
  return seen || state !== "checking";
}
