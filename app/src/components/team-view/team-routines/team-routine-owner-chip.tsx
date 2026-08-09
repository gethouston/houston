import type { Agent } from "../../../lib/types";
import { AgentCardAvatar } from "../../shell/agent-card-avatar";

/**
 * Whose routine this row is, worn beside the routine's name. A team's list is
 * the only routines surface where that question exists at all: on a per-agent
 * list every row has the same owner, so naming it on each one would be noise
 * (the section drops the chip entirely once it is narrowed to one agent).
 *
 * It never truncates — the grid gives it a `shrink-0` slot — and it carries a
 * `title`, so a narrow rail that clips the routine NAME still tells you whose
 * routine you are about to run or delete.
 */
export function TeamRoutineOwnerChip({ agent }: { agent: Agent }) {
  return (
    <span
      title={agent.name}
      className="flex items-center gap-1.5 rounded-full bg-chip-subtle px-1.5 py-0.5 text-xs text-ink-muted"
    >
      <AgentCardAvatar color={agent.color} />
      {agent.name}
    </span>
  );
}
