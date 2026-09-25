import type { TurnBus } from "./bus";

/**
 * The agent's cross-replica turn slot on the TurnBus: an inflight key held
 * under a heartbeat lease, plus the cancel channel the owning replica listens
 * on. The key's VALUE is the conversation key whose turn holds the slot.
 */

/** The inflight lease: long enough to survive GC pauses, short enough that a
 *  crashed replica frees its agents in about a minute. */
const LEASE_SEC = 90;
const LEASE_BEAT_MS = 30_000;

export const inflightKey = (agentId: string) => `turn:inflight:${agentId}`;
export const cancelChannel = (agentId: string) => `turn:cancel:${agentId}`;

/** Claim the agent's slot for `conversationKey`; false when any replica holds it. */
export function claimLease(
  bus: TurnBus,
  agentId: string,
  conversationKey: string,
): Promise<boolean> {
  return bus.setNx(inflightKey(agentId), conversationKey, LEASE_SEC);
}

/** Keep a claimed lease alive; returns the function that stops the beat. */
export function heartbeatLease(bus: TurnBus, agentId: string): () => void {
  const lease = setInterval(() => {
    bus.expire(inflightKey(agentId), LEASE_SEC).catch((err: unknown) => {
      // No request to reject here; losing the lease means another replica
      // could double-start, so this must be loud.
      console.error(`[relay] lease heartbeat failed for ${agentId}:`, err);
    });
  }, LEASE_BEAT_MS);
  return () => clearInterval(lease);
}

/** Free the agent's slot. */
export async function releaseLease(
  bus: TurnBus,
  agentId: string,
): Promise<void> {
  await bus.del(inflightKey(agentId)).catch((err: unknown) => {
    // The lease TTL frees the slot within LEASE_SEC even if this fails.
    console.error(`[relay] inflight release failed for ${agentId}:`, err);
  });
}
