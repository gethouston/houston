import { Badge, cn } from "@houston-ai/core";
import {
  Boxes,
  Brain,
  FileText,
  LibraryBig,
  type LucideIcon,
  Sparkles,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLearnings, useOrg } from "../../hooks/queries";
import { useSession } from "../../hooks/use-session";
import type { Agent } from "../../lib/types";
import { agentPeopleCount } from "./agent-people-choice.ts";
import type {
  AgentSettingsGroup,
  AgentSettingsGroupId,
  AgentSettingsSection,
} from "./agent-settings-nav.ts";

const ICONS: Record<AgentSettingsSection, LucideIcon> = {
  "job-description": FileText,
  learnings: Brain,
  people: Users,
  integrations: Boxes,
  models: Sparkles,
  skills: LibraryBig,
};

/**
 * Title i18n key per section. Every string already exists: the job description
 * and Skills reuse the `agents:subTabs.*` titles, the rest the
 * `teams:agentAdmin.rows.*` ones. Listed explicitly so each key is
 * type-checked and locale-validated.
 */
const SECTION_TITLES = {
  "job-description": "agents:subTabs.instructions",
  learnings: "agentAdmin.rows.knowledge.title",
  people: "agentAdmin.rows.people.title",
  integrations: "agentAdmin.rows.integrations.title",
  models: "agentAdmin.rows.model.title",
  skills: "agents:subTabs.skills",
} as const satisfies Record<AgentSettingsSection, string>;

const GROUP_TITLES = {
  context: "agentSettings.groups.context",
  permissions: "agentSettings.groups.permissions",
} as const satisfies Record<AgentSettingsGroupId, string>;

/**
 * The ONE nav rail every agent-settings surface uses: the settings page's two
 * labelled groups, and the Context / Admin tabs' single flat list. A rail of
 * one group needs no title (there is nothing to tell it apart from), so group
 * titles render only when there is more than one group.
 *
 * Selected rows read like the app sidebar nav (`bg-hover` fill + `aria-current`)
 * with no hover-only affordance. Learnings and People carry bare-number badges
 * so a manager reads the counts without opening the section: People counts the
 * RESOLVED roster ({@link agentPeopleCount}), which is what the section shows —
 * the raw assignee list would render no badge for an everyone-agent and
 * undercount the owner on an explicit one.
 */
export function AgentSettingsRail({
  agent,
  groups,
  ariaLabel,
  selected,
  onSelect,
}: {
  agent: Agent;
  groups: readonly AgentSettingsGroup[];
  ariaLabel: string;
  selected: AgentSettingsSection;
  onSelect: (section: AgentSettingsSection) => void;
}) {
  const { t } = useTranslation(["teams", "agents"]);
  const { data: learnings } = useLearnings(agent.folderPath);
  const showsPeople = groups.some((g) => g.sections.includes("people"));
  const { data: org } = useOrg(showsPeople);
  const { data: session } = useSession();
  const people = useMemo(
    () =>
      showsPeople
        ? agentPeopleCount({
            agent,
            members: org?.members ?? [],
            selfId: session?.uid ?? null,
          })
        : 0,
    [showsPeople, agent, org?.members, session?.uid],
  );

  const badgeCount = (section: AgentSettingsSection): number | undefined => {
    if (section === "learnings" && learnings?.entries.length) {
      return learnings.entries.length;
    }
    if (section === "people" && people > 0) return people;
    return undefined;
  };

  const labelled = groups.length > 1;

  return (
    <nav
      aria-label={ariaLabel}
      className="w-56 shrink-0 overflow-y-auto border-r border-line px-3 py-4"
    >
      {groups.map((group) => (
        <div key={group.id} className="mb-5 last:mb-0">
          {labelled && (
            <p className="mb-1 px-2.5 text-xs font-medium text-ink-muted">
              {t(GROUP_TITLES[group.id])}
            </p>
          )}
          <div className="space-y-0.5">
            {group.sections.map((section) => {
              const Icon = ICONS[section];
              const active = section === selected;
              const count = badgeCount(section);
              return (
                <button
                  key={section}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelect(section)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                    active
                      ? "bg-hover font-medium text-ink"
                      : "text-ink hover:bg-hover",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">
                    {t(SECTION_TITLES[section])}
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
        </div>
      ))}
    </nav>
  );
}
