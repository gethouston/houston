/**
 * Reactive slice of the optimistic warm-up board rows (HOU-713): the missions
 * queued while this agent's engine cold-starts, shaped as `running`
 * activities. Empty (and stable) for a ready agent, so board consumers can
 * merge unconditionally. The store bumps `sendsVersion` on every queue —
 * that's the re-render signal, since entries mutate in place.
 */

import { useMemo } from "react";
import type { Activity } from "../data/activity";
import { warmingBoardRows } from "../lib/warming-board-rows";
import { useAgentProvisioningStore } from "../stores/agent-provisioning";

const NONE: Activity[] = [];

export function useWarmingBoardRows(agentId: string): Activity[] {
  const since = useAgentProvisioningStore(
    (s) => s.provisioning[agentId]?.since,
  );
  const pendingSends = useAgentProvisioningStore(
    (s) => s.provisioning[agentId]?.pendingSends,
  );
  return useMemo(() => {
    if (since === undefined || !pendingSends?.length) return NONE;
    const rows = warmingBoardRows(pendingSends, since);
    return rows.length > 0 ? rows : NONE;
  }, [pendingSends, since]);
}
