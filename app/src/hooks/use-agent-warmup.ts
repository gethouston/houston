import { useEffect, useReducer } from "react";
import {
  type AgentWarmup,
  SLOW_START_MS,
  warmingEntryFor,
  warmupAt,
} from "../lib/agent-provisioning/warmup";
import { useAgentProvisioningStore } from "../stores/agent-provisioning";

export function useAgentWarmup(agentPath: string | null): AgentWarmup {
  const since = useAgentProvisioningStore((s) =>
    agentPath === null
      ? null
      : (warmingEntryFor(Object.values(s.provisioning), agentPath)?.since ??
        null),
  );
  const timedOut = useAgentProvisioningStore(
    (s) =>
      agentPath !== null &&
      warmingEntryFor(Object.values(s.provisioning), agentPath)?.timedOut ===
        true,
  );
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (since === null || timedOut) return;
    const left = since + SLOW_START_MS - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(rerender, left);
    return () => clearTimeout(timer);
  }, [since, timedOut]);
  return warmupAt(since === null ? undefined : { since, timedOut }, Date.now());
}
