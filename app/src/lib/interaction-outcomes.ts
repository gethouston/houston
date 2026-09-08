/**
 * Per-step OUTCOME accounting for a walked interaction sequence.
 *
 * A connect / credential step can be skipped, then walked Back to and completed
 * after all. The composed reply must name FINAL state, never a stale
 * "Skipped ..." line, so each step's last outcome is recorded in place and these
 * fold the map back into the ordered lists `interaction-reply.ts` speaks in.
 */

/** One connect step's FINAL outcome in a walked sequence: the app's display
 *  name and whether it ended connected (true) or skipped (false). A step skipped
 *  then reconsidered records `connected: true` — the LAST outcome for a step id
 *  wins, so the composed reply never carries a stale "Skipped ..." line. */
export interface ConnectOutcome {
  name: string;
  connected: boolean;
  /** A declined step's typed "do this instead" text (the decline row). Present
   *  only on a decline WITH an instruction; a plain skip leaves it undefined. */
  message?: string;
}

/**
 * Split the connect steps' FINAL outcomes into the connected + skipped + declined-
 * with-instruction lists the reply names, in step order. Keyed by step id, so
 * recording a connect over an earlier skip for the SAME step (a reconsider) — or
 * a repeated skip — yields exactly one entry per step, in exactly one list.
 * Steps with no recorded outcome (never reached) are omitted. A declined step
 * whose typed text is non-empty lands in `connectRedirects` (it carries user
 * text, so the sequence resumes visibly); a plain skip lands in
 * `skippedConnectNames`.
 */
export function finalConnectNames(
  connectStepIds: string[],
  outcomes: Map<string, ConnectOutcome>,
): {
  connectedNames: string[];
  skippedConnectNames: string[];
  connectRedirects: { name: string; text: string }[];
} {
  const connectedNames: string[] = [];
  const skippedConnectNames: string[] = [];
  const connectRedirects: { name: string; text: string }[] = [];
  for (const id of connectStepIds) {
    const outcome = outcomes.get(id);
    if (!outcome) continue;
    if (outcome.connected) {
      connectedNames.push(outcome.name);
    } else if (outcome.message != null && outcome.message.length > 0) {
      connectRedirects.push({ name: outcome.name, text: outcome.message });
    } else {
      skippedConnectNames.push(outcome.name);
    }
  }
  return { connectedNames, skippedConnectNames, connectRedirects };
}

/** One credential step's FINAL outcome in a walked sequence: the integration's
 *  display name and whether its key ended saved (true) or skipped (false). A step
 *  skipped then reconsidered records `saved: true` — the LAST outcome for a step
 *  id wins, so the reply never carries a stale "Skipped ..." line. Mirrors
 *  {@link ConnectOutcome}. */
export interface CredentialOutcome {
  name: string;
  saved: boolean;
  /** A declined step's typed "do this instead" text (the decline row). Present
   *  only on a decline WITH an instruction; a plain skip leaves it undefined. */
  message?: string;
}

/**
 * Split the credential steps' FINAL outcomes into the saved + skipped + declined-
 * with-instruction lists the reply names, in step order. Keyed by step id, so
 * saving a key over an earlier skip for the SAME step (a reconsider) — or a
 * repeated skip — yields exactly one entry per step. Steps with no recorded
 * outcome (never reached) are omitted. A declined step whose typed text is
 * non-empty lands in `credentialRedirects` (it carries user text, so the sequence
 * resumes visibly); a plain skip lands in `skippedCredentialNames`. Mirrors
 * {@link finalConnectNames}.
 */
export function finalCredentialNames(
  credentialStepIds: string[],
  outcomes: Map<string, CredentialOutcome>,
): {
  credentialedNames: string[];
  skippedCredentialNames: string[];
  credentialRedirects: { name: string; text: string }[];
} {
  const credentialedNames: string[] = [];
  const skippedCredentialNames: string[] = [];
  const credentialRedirects: { name: string; text: string }[] = [];
  for (const id of credentialStepIds) {
    const outcome = outcomes.get(id);
    if (!outcome) continue;
    if (outcome.saved) {
      credentialedNames.push(outcome.name);
    } else if (outcome.message != null && outcome.message.length > 0) {
      credentialRedirects.push({ name: outcome.name, text: outcome.message });
    } else {
      skippedCredentialNames.push(outcome.name);
    }
  }
  return { credentialedNames, skippedCredentialNames, credentialRedirects };
}
