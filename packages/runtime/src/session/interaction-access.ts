import type { HandsOnSurface } from "@houston/runtime-client";
import { currentInteractionHolder } from "./interaction-holder";

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

export function recordConnection(input: {
  toolkit: string;
  reason?: string;
  refusedAt?: string;
}): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  const reconnect = input.refusedAt
    ? { reconnect: true, refusedAt: input.refusedAt }
    : {};
  const existing = holder.connects.find((c) => c.toolkit === input.toolkit);
  if (existing) {
    if (input.reason) existing.reason = input.reason;
    if (input.refusedAt && !existing.reconnect)
      Object.assign(existing, reconnect);
    return;
  }
  holder.connects.push({
    kind: "connect",
    id: `c${holder.connects.length + 1}`,
    toolkit: input.toolkit,
    ...(input.reason ? { reason: input.reason } : {}),
    ...reconnect,
  });
}

export function reconnectQueued(toolkit: string): boolean {
  return (
    currentInteractionHolder()?.connects.some(
      (c) => c.toolkit === toolkit && c.reconnect === true,
    ) ?? false
  );
}

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

export function recordHandsOn(input: {
  surface: HandsOnSurface;
  agentId?: string;
  reason?: string;
}): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  const reason = input.reason?.trim();
  const existing = holder.handsOn.find(
    (step) => step.surface === input.surface && step.agentId === input.agentId,
  );
  if (existing) {
    if (reason) existing.reason = reason;
    return;
  }
  holder.handsOn.push({
    kind: "hands_on",
    id: `h${holder.handsOn.length + 1}`,
    surface: input.surface,
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(reason ? { reason } : {}),
  });
}
