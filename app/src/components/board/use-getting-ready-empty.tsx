import type { ReactNode } from "react";
import { useAgentWarmup } from "../../hooks/use-agent-warmup";
import type { Agent } from "../../lib/types";
import { AgentGettingReady } from "../shell/agent-getting-ready";

export function useGettingReadyEmpty(
  pinnedAgent: Agent | null,
  pinnedTaskCount: number,
): ReactNode | undefined {
  const warmup = useAgentWarmup(pinnedAgent?.folderPath ?? null);
  if (pinnedAgent === null || warmup === "ready" || pinnedTaskCount > 0) {
    return undefined;
  }
  return (
    <AgentGettingReady agent={pinnedAgent} stalled={warmup === "stalled"} />
  );
}
