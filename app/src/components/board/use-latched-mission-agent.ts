import { useCallback, useEffect, useRef } from "react";
import { latchMissionAgent } from "../../lib/archived-mission-agent";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";

/**
 * "Focus the open archived mission's agent", bound to the agent that was
 * captured while the mission was still listed rather than the one the list
 * happens to derive when the callback FIRES.
 *
 * The archived → active handoff runs after a send resolves, and that send
 * re-activates the mission — so the archived list may already have refetched
 * without it, leaving the live derivation null and the handoff pointing at
 * whatever agent was current. The rule itself is {@link latchMissionAgent}
 * (pure, unit-tested); this hook is just its React binding.
 *
 * The returned callback is stable: it reads the ref at fire time, so it never
 * re-arms the handoff (and never invalidates the chat panel's callbacks) when
 * the archived list refetches.
 */
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
