import {
  Blocks,
  Brain,
  Cpu,
  FileText,
  LayoutTemplate,
  LibraryBig,
  type LucideIcon,
  Settings,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useAgentConfig,
  useLearnings,
  useSkills,
} from "../../../hooks/queries";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { getProvider } from "../../../lib/providers.ts";
import type { Agent } from "../../../lib/types";
import { SettingsCard, SettingsRow } from "../../settings/settings-row";
import { type AgentAdminScreen, agentAdminCards } from "./agent-admin-nav.ts";

const ICONS: Record<AgentAdminScreen, LucideIcon> = {
  instructions: FileText,
  skills: LibraryBig,
  knowledge: Brain,
  model: Cpu,
  people: Users,
  integrations: Blocks,
  general: Settings,
  template: LayoutTemplate,
};

/**
 * Title + description i18n key per row. Instructions/skills/general reuse the
 * existing `agents:subTabs.*` titles; the rest are new `teams:agentAdmin.*` keys
 * (listed explicitly so every key is type-checked and locale-validated).
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
  general: {
    title: "agents:subTabs.general",
    desc: "agentAdmin.rows.general.desc",
  },
  template: {
    title: "agentAdmin.rows.template.title",
    desc: "agentAdmin.rows.template.desc",
  },
} as const satisfies Record<AgentAdminScreen, { title: string; desc: string }>;

/**
 * The Settings-style landing for the manager-only Agent Settings tab. Grouped
 * cards (Configuration / Access / General) whose rows drill into a full-pane
 * screen reusing the existing editors. Card + row visibility is the pure
 * {@link agentAdminCards}; single-player drops the Access card and template row.
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
  const path = agent.folderPath;
  const { data: skills } = useSkills(path);
  const { data: learnings } = useLearnings(path);
  const { data: config } = useAgentConfig(path);
  const cards = agentAdminCards(capabilities, agent);

  const value = (s: AgentAdminScreen): string | undefined => {
    if (s === "skills" && skills?.length) {
      return t("agentAdmin.values.skillCount", { count: skills.length });
    }
    if (s === "knowledge" && learnings?.entries.length) {
      return t("agentAdmin.values.learningCount", {
        count: learnings.entries.length,
      });
    }
    if (s === "model") return getProvider(config?.provider ?? "")?.name;
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
      </div>
    </div>
  );
}
