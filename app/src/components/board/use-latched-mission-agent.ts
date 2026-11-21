import { useCallback, useEffect, useRef } from "react";
import { latchMissionAgent } from "../../lib/archived-mission-agent";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";

export function useLatchedMissionAgent(
  selectedId: string | null,
  activeAgent: Agent | null,
): () => void {
  const latched = useRef<Agent | null>(null);
  useEffect(() => {
    latched.current = latchMissionAgent(
      latched.current,
      selectedId,
      activeAgent,
    );
  }, [selectedId, activeAgent]);

  return useCallback(() => {
    const target = latched.current;
    if (target) useAgentStore.getState().setCurrent(target);
  }, []);
}
