import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { openAgentBoard } from "../../lib/open-agent";
import type { Agent } from "../../lib/types";
import { UsageBar, UsageCount } from "./org-chart-usage";
import type { OrgChartUsageState } from "./org-chart-view-model";

/**
 * One agent inside a team card: its helmet, its name, its 30-day message count
 * and a bar drawn against the busiest agent in the whole chart, so the cards
 * compare to each other and not each to itself.
 *
 * The whole row is the button — an org chart is a map, and the point of a map
 * is that you can go there — and it lands on the agent's own board, the same
 * destination every other "take me to this agent" affordance uses. An agent
 * with no traffic still holds its row with an empty bar: a team reads as who is
 * in it, not as who happened to be busy this month.
 */
export function OrgChartAgentRow({
  agent,
  messages,
  scale,
  state,
}: {
  agent: Agent;
  messages: number;
  scale: number;
  state: OrgChartUsageState;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => openAgentBoard(agent.id)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus active:scale-[0.99]"
      >
        <HoustonAvatar color={resolveAgentColor(agent.color)} diameter={24} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm text-ink">{agent.name}</span>
            <UsageCount state={state} messages={messages} />
          </div>
          <UsageBar state={state} messages={messages} scale={scale} />
        </div>
      </button>
    </li>
  );
}
