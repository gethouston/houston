import { Badge, cn } from "@houston-ai/core";
import {
  Boxes,
  Brain,
  FileText,
  type LucideIcon,
  Sparkles,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLearnings } from "../../../hooks/queries";
import type { Agent } from "../../../lib/types";
import type { AgentAdminScreen } from "./agent-admin-nav.ts";

const ICONS: Record<AgentAdminScreen, LucideIcon> = {
  instructions: FileText,
  knowledge: Brain,
  people: Users,
  integrations: Boxes,
  model: Sparkles,
};

/**
 * Title i18n key per nav item. Instructions reuses the existing
 * `agents:subTabs.*` title; the rest are `teams:agentAdmin.rows.*.title` keys
 * (listed explicitly so every key is type-checked and locale-validated).
 */
const ROW_TITLES = {
  instructions: "agents:subTabs.instructions",
  knowledge: "agentAdmin.rows.knowledge.title",
  people: "agentAdmin.rows.people.title",
  integrations: "agentAdmin.rows.integrations.title",
  model: "agentAdmin.rows.model.title",
} as const satisfies Record<AgentAdminScreen, string>;

/**
 * The slim nav rail the Context and Admin tabs share: one flat list of the
 * rows the owning tab passes in, in order, with no visible group separation.
 * Each nav item surfaces its note / people counts as bare-number badges, so a
 * manager reads it without opening the section. The selected item is styled
 * like the app sidebar nav (`bg-hover`, aria-current) with no hover-only
 * affordance.
 */
export function AgentAdminSidebar({
  agent,
  rows,
  ariaLabel,
  selected,
  onSelect,
}: {
  agent: Agent;
  rows: AgentAdminScreen[];
  ariaLabel: string;
  selected: AgentAdminScreen;
  onSelect: (screen: AgentAdminScreen) => void;
}) {
  const { t } = useTranslation(["teams", "agents"]);
  const { data: learnings } = useLearnings(agent.folderPath);

  // Note / people counts render as bare-number badges.
  const badgeCount = (s: AgentAdminScreen): number | undefined => {
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
      aria-label={ariaLabel}
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
