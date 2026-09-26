import { useTranslation } from "react-i18next";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { TeamGlyph } from "../shell/team-glyph";
import { OrgChartAgentRow } from "./org-chart-agent-row";
import { CARD_SURFACE } from "./org-chart-cards";
import type { OrgChartUsage } from "./org-chart-model";
import type { OrgChartUsageState } from "./org-chart-view-model";

export function OrgChartTeamCard({
  team,
  agents,
  usage,
  scale,
  state,
}: {
  team?: TeamView;
  agents: Agent[];
  usage: OrgChartUsage;
  scale: number;
  state: OrgChartUsageState;
}) {
  const { t } = useTranslation("teams");
  return (
    <li className={CARD_SURFACE}>
      {team ? (
        <div className="flex w-full items-center gap-2.5 px-1 py-1">
          <TeamGlyph team={team} className="size-5 shrink-0" />
          <span className="truncate text-sm font-medium text-ink">
            {team.name}
          </span>
        </div>
      ) : (
        <p className="px-1 py-1 text-sm font-medium text-ink-muted">
          {t("orgChart.noTeam")}
        </p>
      )}
      <div className="mt-4 border-t border-line/60 pt-3">
        <p className="mb-2 text-sm font-medium text-ink">
          {t("orgChart.agents")}
        </p>
        {agents.length === 0 ? (
          <p className="px-1 text-sm text-ink-muted">
            {t("orgChart.emptyTeam")}
          </p>
        ) : (
          <ul className="flex flex-col">
            {agents.map((agent) => (
              <OrgChartAgentRow
                key={agent.id}
                agent={agent}
                messages={usage.byAgent.get(agent.id) ?? 0}
                scale={scale}
                state={state}
              />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
