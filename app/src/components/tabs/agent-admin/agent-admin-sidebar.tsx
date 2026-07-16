import { Badge, cn } from "@houston-ai/core";
import {
  Brain,
  Cable,
  FileText,
  LibraryBig,
  type LucideIcon,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLearnings, useSkills } from "../../../hooks/queries";
import { useCapabilities } from "../../../hooks/use-capabilities";
import type { Agent } from "../../../lib/types";
import { type AgentAdminScreen, agentAdminCards } from "./agent-admin-nav.ts";

const ICONS: Record<AgentAdminScreen, LucideIcon> = {
  instructions: FileText,
  skills: LibraryBig,
  knowledge: Brain,
  people: Users,
  connect: Cable,
};

/**
 * Title i18n key per nav item. Instructions/skills reuse the existing
 * `agents:subTabs.*` titles; the rest are `teams:agentAdmin.rows.*.title` keys
 * (listed explicitly so every key is type-checked and locale-validated).
 */
const ROW_TITLES = {
  instructions: "agents:subTabs.instructions",
  skills: "agents:subTabs.skills",
  knowledge: "agentAdmin.rows.knowledge.title",
  people: "agentAdmin.rows.people.title",
  connect: "connect:row.title",
} as const satisfies Record<AgentAdminScreen, string>;

/**
 * The slim settings nav rail for the manager-only Agent Settings tab: one flat
 * list of every row from the pure {@link agentAdminCards} (single-player drops
 * the access rows), in card order, with no visible group separation. Each nav
 * item surfaces its skill / note / people counts as bare-number badges, so a
 * manager reads it without opening the section. The selected item is styled
 * like the app sidebar nav (`bg-hover`, aria-current) with no hover-only
 * affordance.
 */
export function AgentAdminSidebar({
  agent,
  selected,
  onSelect,
}: {
  agent: Agent;
  selected: AgentAdminScreen;
  onSelect: (screen: AgentAdminScreen) => void;
}) {
  const { t } = useTranslation(["teams", "agents"]);
  const { capabilities } = useCapabilities();
  const path = agent.folderPath;
  const { data: skills } = useSkills(path);
  const { data: learnings } = useLearnings(path);
  // Flatten the gated card model into one flat, in-order row list — the cards
  // still gate which rows show (single-player drops the access rows); the rail
  // renders them as a single sequence with no group separation.
  const rows = agentAdminCards(capabilities).flatMap((card) => card.rows);

  // Skill / note / people counts render as bare-number badges.
  const badgeCount = (s: AgentAdminScreen): number | undefined => {
    if (s === "skills" && skills?.length) return skills.length;
    if (s === "knowledge" && learnings?.entries.length) {
      return learnings.entries.length;
    }
    if (s === "people" && agent.assignments?.length) {
      return agent.assignments.length;
    }
    return undefined;
  };

  return (
    <nav
      aria-label={t("agentAdmin.title")}
      className="w-56 shrink-0 overflow-y-auto border-r border-line px-3 py-4"
    >
      <div className="space-y-0.5">
        {rows.map((s) => {
          const Icon = ICONS[s];
          const active = s === selected;
          const count = badgeCount(s);
          return (
            <button
              key={s}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(s)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                active
                  ? "bg-hover font-medium text-ink"
                  : "text-ink hover:bg-hover",
              )}
            >
              <Icon className="size-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate">
                {t(ROW_TITLES[s])}
              </span>
              {count !== undefined && (
                <Badge
                  variant="secondary"
                  className="min-w-5 px-1.5 font-normal tabular-nums text-ink-muted"
                >
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
