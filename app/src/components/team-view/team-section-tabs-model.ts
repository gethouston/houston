import type { NavEntry } from "../../lib/nav-stack.ts";
import { AGENTS_HOME_VIEW_ID } from "../../lib/top-level-views.ts";

export function phoneTaskListReturn(
  stack: readonly NavEntry[],
  index: number,
  agentId: string,
): "pop" | "replace" {
  const previous = index > 0 ? stack[index - 1] : undefined;
  return previous !== undefined &&
    previous.viewMode === AGENTS_HOME_VIEW_ID &&
    previous.agentsHomeAgentId === agentId &&
    previous.chatAgentId === null
    ? "pop"
    : "replace";
}
