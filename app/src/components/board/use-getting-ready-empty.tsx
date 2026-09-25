import type { ReactNode } from "react";
import { useAgentWarmup } from "../../hooks/use-agent-warmup";
import type { Agent } from "../../lib/types";
import { AgentGettingReady } from "../shell/agent-getting-ready";

/**
 * The empty state of a board pinned to one AI Employee that is still starting
 * and has no tasks: "Getting {{name}} ready" instead of bare columns while the
 * first-day offer waits on the warm-up. Undefined otherwise.
 */
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
