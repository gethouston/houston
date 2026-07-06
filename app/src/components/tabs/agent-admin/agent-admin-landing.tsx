import {
  Blocks,
  Brain,
  Cpu,
  FileText,
  LibraryBig,
  type LucideIcon,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLearnings, useSkills } from "../../../hooks/queries";
import { useAgentSettings } from "../../../hooks/queries/use-agent-settings";
import { useCapabilities } from "../../../hooks/use-capabilities";
import type { Agent } from "../../../lib/types";
import { SettingsCard, SettingsRow } from "../../settings/settings-row";
import { AgentAdminDetails } from "./agent-admin-details";
import { type AgentAdminScreen, agentAdminCards } from "./agent-admin-nav.ts";
import { ceilingValue } from "./agent-admin-row-values.ts";

const ICONS: Record<AgentAdminScreen, LucideIcon> = {
  instructions: FileText,
  skills: LibraryBig,
  knowledge: Brain,
  model: Cpu,
  people: Users,
  integrations: Blocks,
};

/**
 * Title + description i18n key per row. Instructions/skills reuse the existing
 * `agents:subTabs.*` titles; the rest are new `teams:agentAdmin.*` keys (listed
 * explicitly so every key is type-checked and locale-validated).
 */
const ROW_KEYS = {
  instructions: {
    title: "agents:subTabs.instructions",
    desc: "agentAdmin.rows.instructions.desc",
  },
  skills: {
    title: "agents:subTabs.skills",
    desc: "agentAdmin.rows.skills.desc",
  },
  knowledge: {
    title: "agentAdmin.rows.knowledge.title",
    desc: "agentAdmin.rows.knowledge.desc",
  },
  model: {
    title: "agentAdmin.rows.model.title",
    desc: "agentAdmin.rows.model.desc",
  },
  people: {
    title: "agentAdmin.rows.people.title",
    desc: "agentAdmin.rows.people.desc",
  },
  integrations: {
    title: "agentAdmin.rows.integrations.title",
    desc: "agentAdmin.rows.integrations.desc",
  },
} as const satisfies Record<AgentAdminScreen, { title: string; desc: string }>;

/**
 * The Settings-style landing for the manager-only Agent Settings tab. Grouped
 * cards (Configuration / Access) whose rows drill into a full-pane screen, then
 * a "General" card of inline name / color / delete rows. Card + row visibility
 * is the pure {@link agentAdminCards}; single-player drops the Access card. Each
 * row surfaces its current state inline (skill/note/people counts, and the
 * model + integration ceilings) so a manager sees it without drilling in.
 */
export function AgentAdminLanding({
  agent,
  onSelect,
}: {
  agent: Agent;
  onSelect: (screen: AgentAdminScreen) => void;
}) {
  const { t } = useTranslation(["teams", "agents"]);
  const { capabilities } = useCapabilities();
  const teams = capabilities?.teams === true;
  const path = agent.folderPath;
  const { data: skills } = useSkills(path);
  const { data: learnings } = useLearnings(path);
  const { data: settings } = useAgentSettings(agent.id, teams);
  const cards = agentAdminCards(capabilities);

  const value = (s: AgentAdminScreen): string | undefined => {
    if (s === "skills" && skills?.length) {
      return t("agentAdmin.values.skillCount", { count: skills.length });
    }
    if (s === "knowledge" && learnings?.entries.length) {
      return t("agentAdmin.values.learningCount", {
        count: learnings.entries.length,
      });
    }
    if (s === "model") {
      const v = ceilingValue(settings?.allowedModels);
      if (!v) return undefined;
      return v.kind === "all"
        ? t("agentAdmin.values.allModels")
        : t("agentAdmin.values.modelCount", { count: v.count });
    }
    if (s === "integrations") {
      const v = ceilingValue(settings?.allowedToolkits);
      if (!v) return undefined;
      return v.kind === "all"
        ? t("agentAdmin.values.allApps")
        : t("agentAdmin.values.appCount", { count: v.count });
    }
    if (s === "people" && agent.assignments?.length) {
      return t("share.peopleCount", { count: agent.assignments.length });
    }
    return undefined;
  };

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <header className="mb-8 px-1">
        <h1 className="text-[28px] font-normal text-foreground">
          {t("agentAdmin.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("agentAdmin.subtitle")}
        </p>
      </header>

      <div className="space-y-8">
        {cards.map((card) => (
          <SettingsCard key={card.id} title={t(`agentAdmin.groups.${card.id}`)}>
            {card.rows.map((s) => (
              <SettingsRow
                key={s}
                icon={ICONS[s]}
                title={t(ROW_KEYS[s].title)}
                description={t(ROW_KEYS[s].desc)}
                value={value(s)}
                onClick={() => onSelect(s)}
              />
            ))}
          </SettingsCard>
        ))}

        <AgentAdminDetails agent={agent} />
      </div>
    </div>
  );
}
