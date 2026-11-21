import type { ReactNode } from "react";
import type { TeamView } from "../../lib/teams-model";
import { teamActivityRollup } from "./agent-activity-summary-model";
import type { AgentItemArgs } from "./agent-sidebar-items";
import { NeedsYouChip, RunningRing } from "./agent-sidebar-status";
import { TeamGlyph } from "./team-glyph";

export interface TeamHeaderSignals {
  icon: ReactNode;
  trailing?: ReactNode;
}

export function teamHeaderSignals(
  args: Pick<AgentItemArgs, "summaries" | "runningLabel" | "needsYouLabel">,
): (team: TeamView, collapsed: boolean) => TeamHeaderSignals {
  return (team, collapsed) => {
    const glyph = <TeamGlyph team={team} />;
    if (!collapsed) return { icon: glyph };
    const rollup = teamActivityRollup(
      team.agents.map((agent) => agent.id),
      args.summaries,
    );
    return {
      icon:
        rollup.runningCount > 0 ? (
          <RunningRing label={args.runningLabel(rollup.runningCount)}>
            {glyph}
          </RunningRing>
        ) : (
          glyph
        ),
      ...(rollup.needsYouCount > 0
        ? {
            trailing: (
              <NeedsYouChip
                count={rollup.needsYouCount}
                label={args.needsYouLabel(rollup.needsYouCount)}
              />
            ),
          }
        : {}),
    };
  };
}
