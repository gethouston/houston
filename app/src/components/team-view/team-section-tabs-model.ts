import type { NavEntry } from "../../lib/nav-stack.ts";
import { AGENTS_HOME_VIEW_ID } from "../../lib/top-level-views.ts";

/**
 * How the phone returns from an employee's screen to that employee's task
 * list (the AI Employees drill-in).
 *
 * `retreat` cannot answer this: its pop compares WHOLE entries, and the
 * drill-in entry carries whatever employee screen fields stood before it, so
 * it never equals a fresh write. Recognising the drill-in by its own address
 * pops the real entry when the user came from it; anywhere else (a deep link,
 * the first entry) the screen is replaced by the list, so back never no-ops.
 */
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
