import type { LocalBridgeJournal } from "./types";

export function sameBridgeIdentity(
  a: LocalBridgeJournal["identity"],
  b: LocalBridgeJournal["identity"],
) {
  return (
    a.environment === b.environment &&
    a.orgId === b.orgId &&
    a.userId === b.userId &&
    a.agentId === b.agentId
  );
}
