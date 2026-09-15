import type { HandsOnSurface } from "@houston/runtime-client";
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

/** Provider requests keep their first position and refresh a repeated reason. */
export function recordProviderConnection(input: {
  provider: string;
  reason?: string;
}): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  const provider = input.provider.trim().toLowerCase();
  const reason = input.reason?.trim();
  const existing = holder.providerConnects.find(
    (step) => step.provider === provider,
  );
  if (existing) {
    if (reason) existing.reason = reason;
    return;
  }
  holder.providerConnects.push({
    kind: "provider_connect",
    id: `p${holder.providerConnects.length + 1}`,
    provider,
    ...(reason ? { reason } : {}),
  });
}

/**
 * Append a hands-on errand for this turn (ids `h1`..`hN`), deduped by the
 * SCREEN plus what it opens focused on: two routines' webhooks are two errands,
 * the same one asked for twice is one card. A repeat keeps its id and position
 * and refreshes the reason. A no-op outside a turn.
 */
export function recordHandsOn(input: {
  surface: HandsOnSurface;
  reason?: string;
  target?: string;
}): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  const target = input.target?.trim() || undefined;
  const reason = input.reason?.trim();
  const existing = holder.handsOn.find(
    (step) => step.surface === input.surface && step.target === target,
  );
  if (existing) {
    if (reason) existing.reason = reason;
    return;
  }
  holder.handsOn.push({
    kind: "hands_on",
    id: `h${holder.handsOn.length + 1}`,
    surface: input.surface,
    ...(reason ? { reason } : {}),
    ...(target ? { target } : {}),
  });
}
