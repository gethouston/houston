import type { TurnBus } from "./bus";

const LEASE_SEC = 90;
const LEASE_BEAT_MS = 30_000;

export const inflightKey = (agentId: string) => `turn:inflight:${agentId}`;
export const cancelChannel = (agentId: string) => `turn:cancel:${agentId}`;

export function claimLease(
  bus: TurnBus,
  agentId: string,
  conversationKey: string,
): Promise<boolean> {
  return bus.setNx(inflightKey(agentId), conversationKey, LEASE_SEC);
}

export function heartbeatLease(bus: TurnBus, agentId: string): () => void {
  const lease = setInterval(() => {
    bus.expire(inflightKey(agentId), LEASE_SEC).catch((err: unknown) => {
      console.error(`[relay] lease heartbeat failed for ${agentId}:`, err);
    });
  }, LEASE_BEAT_MS);
  return () => clearInterval(lease);
}

export async function releaseLease(
  bus: TurnBus,
  agentId: string,
): Promise<void> {
  await bus.del(inflightKey(agentId)).catch((err: unknown) => {
    console.error(`[relay] inflight release failed for ${agentId}:`, err);
  });
}
