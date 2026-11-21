import type { ConnectionEvidence } from "@houston/sdk/provider-connection-observer";

export function providerConnectProbing(
  state: ConnectionEvidence,
  hasEvidence: boolean,
): boolean {
  return state === "checking" && !hasEvidence;
}

export function providerConnectEvidenceSeen(
  seen: boolean,
  state: ConnectionEvidence,
): boolean {
  return seen || state !== "checking";
}
