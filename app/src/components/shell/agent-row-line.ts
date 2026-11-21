import type { Agent } from "../../lib/types.ts";
import type { AgentActivitySummary } from "./agent-activity-summary-model.ts";
import type { HeadlineStatus } from "./mission-headline-model.ts";

export type AgentRowLine =
  | { kind: "mission"; status: HeadlineStatus; title: string }
  | { kind: "firstDay" }
  | { kind: "role"; role: string }
  | { kind: "empty" };

export function agentRowLine(
  agent: Pick<Agent, "role">,
  summary: AgentActivitySummary,
  invitesFirstDay: boolean,
): AgentRowLine {
  const { headline } = summary;
  if (headline) {
    return {
      kind: "mission",
      status: headline.status,
      title: headline.title,
    };
  }
  if (summary.history === "none" && invitesFirstDay)
    return { kind: "firstDay" };
  return agent.role ? { kind: "role", role: agent.role } : { kind: "empty" };
}
