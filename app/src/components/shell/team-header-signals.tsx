import type { ReactNode } from "react";
import type { TeamView } from "../../lib/teams-model";
import { teamActivityRollup } from "./agent-activity-summary-model";
import type { AgentItemArgs } from "./agent-sidebar-items";
import { NeedsYouChip, RunningRing } from "./agent-sidebar-status";
import { TeamGlyph } from "./team-glyph";

/** What a block's header row wears in the two slots it has. */
export interface TeamHeaderSignals {
  icon: ReactNode;
  trailing?: ReactNode;
}

/**
 * The glyph and the badge a team block's header carries.
 *
 * **Only while it is FOLDED.** Open, the block's agent rows carry their own
 * running ring and their own needs-you chip, and a header repeating them would
 * count the same waiting work twice inside one block. Folded, those rows are
 * not on screen at all, and "collapse this team" must never mean "stop telling
 * me my agents need something" — so the header says it on their behalf.
 *
 * It reuses the agent row's OWN components rather than dressing a team badge to
 * look like one: `RunningRing` is literally the ring an avatar wears, and
 * `NeedsYouChip` is literally the chip. A second treatment drawn a hair
 * differently would read as a second kind of urgency.
 *
 * A curried builder rather than a plain function: the labels come from `t()`
 * and the summaries from a hook, so binding them once per render keeps every
 * block asking the same question with the same words.
 */
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
