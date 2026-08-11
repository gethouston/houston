import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { useQueries } from "@tanstack/react-query";
import {
  Blocks,
  BookOpenText,
  Boxes,
  Brain,
  Palette,
  Users,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { agentSettingsQueryOptions } from "../../hooks/queries/use-agent-settings";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isMultiplayer } from "../../lib/org-roles";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import {
  type AgentSettingsSection,
  SECTION_TITLES,
} from "../agent-settings/agent-settings-nav";
import { SettingsCard, SettingsRow } from "../settings/settings-row";
import { agentPolicyChips } from "./agent-policy-chips-model";
import { ceilingPolicyValue, peoplePolicyValue } from "./agent-policy-values";
import { useAgentSettingsNav } from "./agent-settings-nav-store";
import { teamFanOut } from "./team-fan-out";

const ROWS: readonly [AgentSettingsSection, typeof Palette][] = [
  ["manage", Palette],
  ["job-description", BookOpenText],
  ["skills", Wrench],
  ["learnings", Brain],
  ["people", Users],
  // The same glyphs the rail's own Integrations and AI Models rows wear, so
  // one concept never carries two marks.
  ["integrations", Blocks],
  ["models", Boxes],
];

export function TeamAgentsList({ team }: { team: TeamView }) {
  const { t } = useTranslation(["teams", "agents"]);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const request = useAgentSettingsNav((s) => s.requestAgentDetail);
  const { capabilities } = useCapabilities();
  // Gateway-cheap policy values only (roster + ceilings): reading pod-owned
  // facts roster-wide would wake every cold pod, so those rows carry none.
  const showPolicy = capabilities?.teams === true;
  const { data: org } = useOrg(isMultiplayer(capabilities));
  const members = org?.members ?? [];
  const settings = useQueries({
    queries: team.agents.map((agent) =>
      agentSettingsQueryOptions(agent.id, showPolicy, true),
    ),
    combine: teamFanOut,
  });

  const open = (agent: Agent, section: AgentSettingsSection) => {
    request(agent.id, section);
    openTeamView(team.id, "settings", {
      agentFilter: agent.id,
      agentFocus: true,
    });
  };
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={team.agents[0]?.id}
      className="rounded-xl border border-line bg-card px-4"
    >
      {team.agents.map((agent, index) => {
        const chips = agentPolicyChips(agent, members, settings.data[index]);
        const values: Partial<
          Record<AgentSettingsSection, string | undefined>
        > = showPolicy
          ? {
              people: peoplePolicyValue(t, chips.people),
              integrations: ceilingPolicyValue(
                t,
                chips.integrations,
                "integrations",
              ),
              models: ceilingPolicyValue(t, chips.models, "models"),
            }
          : {};
        return (
          <AccordionItem key={agent.id} value={agent.id}>
            <AccordionTrigger data-testid={`team-agent-${agent.id}`}>
              <span className="flex items-center gap-3">
                <HoustonAvatar
                  color={resolveAgentColor(agent.color)}
                  diameter={28}
                />
                {agent.name}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <SettingsCard>
                {ROWS.map(([section, icon]) => (
                  <SettingsRow
                    key={section}
                    icon={icon}
                    title={
                      section === "manage"
                        ? t("teams:agentSettings.manage.identity")
                        : t(SECTION_TITLES[section])
                    }
                    value={values[section]}
                    testId={`team-agent-${agent.id}-${section}`}
                    onClick={() => open(agent, section)}
                  />
                ))}
              </SettingsCard>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
