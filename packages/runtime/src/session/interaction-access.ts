import { currentInteractionHolder } from "./interaction-holder";

/**
 * Record the single signin step for this turn (the host reported the user must
 * sign in to Houston before integrations can act). Idempotent: there is at most
 * one signin step (id `s1`), so a repeat call keeps that one step and the LAST
 * call's reason wins. A no-op outside a turn.
 */
export function recordSignin(input: { reason?: string }): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  const reason = input.reason?.trim();
  holder.signin = {
    kind: "signin",
    id: "s1",
    ...(reason ? { reason } : {}),
  };
}

/**
 * Append a connect step for this turn, deduped by toolkit: a first mention gets
 * the next `c1`..`cN` id; a repeat for the same toolkit updates its reason in
 * place (keeping its id and position). A no-op outside a turn.
 */
export function recordConnection(input: {
  toolkit: string;
  reason?: string;
}): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  const existing = holder.connects.find((c) => c.toolkit === input.toolkit);
  if (existing) {
    if (input.reason) existing.reason = input.reason;
    return;
  }
  holder.connects.push({
    kind: "connect",
    id: `c${holder.connects.length + 1}`,
    toolkit: input.toolkit,
    ...(input.reason ? { reason: input.reason } : {}),
  });
}

/**
 * Append a credential step for this turn (the model called `request_credential`
 * for a custom integration), deduped by toolkit exactly like connects: a first
 * mention gets the next `k1`..`kN` id; a repeat for the same toolkit updates
 * its reason in place. A no-op outside a turn.
 */
export function recordCredentialRequest(input: {
  toolkit: string;
  reason?: string;
}): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  const existing = holder.credentials.find((c) => c.toolkit === input.toolkit);
  if (existing) {
    if (input.reason) existing.reason = input.reason;
    return;
  }
  holder.credentials.push({
    kind: "credential",
    id: `k${holder.credentials.length + 1}`,
    toolkit: input.toolkit,
    ...(input.reason ? { reason: input.reason } : {}),
  });
}
