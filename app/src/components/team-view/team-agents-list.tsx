import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { SidebarRowCaret } from "@houston-ai/layout";
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
import {
  SettingsCard,
  SettingsGroupTitle,
  SettingsRow,
} from "../settings/settings-row";
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
    // No wrapper card: each agent is a settings GROUP (title outside, card of
    // rows below), the way the Settings index composes its groups.
    <Accordion
      type="multiple"
      defaultValue={team.agents[0] ? [team.agents[0].id] : []}
      className="flex flex-col gap-6"
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
          <AccordionItem key={agent.id} value={agent.id} className="border-0">
            <SettingsGroupTitle className="!mb-0">
              <AccordionTrigger
                data-testid={`team-agent-${agent.id}`}
                indicator="none"
                // `group/acc` drives the triangle: Radix stamps data-state on
                // this trigger, and the caret's own prop cannot see it.
                className="group/acc min-w-0 cursor-pointer items-center justify-start gap-2 py-0 font-inherit hover:no-underline"
              >
                <HoustonAvatar
                  color={resolveAgentColor(agent.color)}
                  diameter={28}
                />
                <span className="min-w-0 truncate">{agent.name}</span>
                <SidebarRowCaret
                  expanded={false}
                  className="group-data-[state=open]/acc:rotate-90"
                />
              </AccordionTrigger>
            </SettingsGroupTitle>
            <AccordionContent className="pt-3 pb-0">
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
