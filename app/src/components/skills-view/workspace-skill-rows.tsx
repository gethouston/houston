import {
  CATALOG_INSTALLED_PREVIEW_CAP,
  CatalogGrid,
  CatalogRow,
  CatalogShowMore,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { installedPreview } from "../../lib/installed-preview";
import {
  filterWorkspaceSkills,
  type WorkspaceSkillAgent,
  type WorkspaceSkillRow,
} from "../../lib/workspace-skills";
import { SkillIcon } from "../skill-icon";
import { resolveSkillsListState } from "./skills-list-model";
import { SkillsListEmpty } from "./skills-list-states";

/** Avatars a row shows before collapsing the rest into "+N". */
const ROW_AVATAR_CAP = 3;

/** The overlapping holder stack: who has this skill, at a glance. */
function AgentStack({ agents }: { agents: WorkspaceSkillAgent[] }) {
  const { t } = useTranslation("skills");
  const shown = agents.slice(0, ROW_AVATAR_CAP);
  const extra = agents.length - shown.length;
  return (
    // One image with one name: the avatars are a picture of a list, and the
    // per-avatar `title` only ever reaches a pointer. The label names EVERY
    // holder, including the ones the "+N" chip stands in for.
    <span
      role="img"
      aria-label={t("grid.agentStackLabel", {
        names: agents.map((agent) => agent.name).join(", "),
      })}
      className="flex items-center"
    >
      {shown.map((agent, i) => (
        <span
          key={agent.id}
          title={agent.name}
          className={i > 0 ? "-ml-1.5" : undefined}
        >
          <HoustonAvatar color={resolveAgentColor(agent.color)} diameter={20} />
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-chip px-1 text-xs tabular-nums text-chip-text">
          +{extra}
        </span>
      )}
    </span>
  );
}

/** Rows carry the store fields when the deployment shares (ADR 0003). */
type PageSkillRow = WorkspaceSkillRow & {
  origin?: "shared" | "local";
  overriddenBy?: WorkspaceSkillAgent[];
};

/**
 * The **Your skills** strip, on both scopes of the Skills surface: one row per
 * slug, opening that skill's full-page editor in place of the list.
 * Preview-capped behind "Show all" at rest; an active query drops the cap.
 * With nothing to list it renders the empty state, so the section never
 * collapses to a bare search field.
 */
export function useWorkspaceSkillRows({
  rows,
  query,
  onOpenEditor,
  showAgentStack,
}: {
  rows: PageSkillRow[];
  query: string;
  /** Open the skill's editor (the list steps aside for it). */
  onOpenEditor: (row: PageSkillRow) => void;
  /** The stack of AI Employees holding the skill. An employee's OWN section
   *  answers that question by standing there, so it carries no stack. */
  showAgentStack: boolean;
}): { installedCount: number; installed: ReactNode } {
  const { t } = useTranslation("skills");
  const [expanded, setExpanded] = useState(false);
  const filtered = useMemo(
    () => filterWorkspaceSkills(rows, query),
    [rows, query],
  );
  const searching = query.trim() !== "";
  const { visible, showExpander } = installedPreview(filtered, {
    searching,
    expanded,
    cap: CATALOG_INSTALLED_PREVIEW_CAP,
  });

  const state = resolveSkillsListState({
    total: rows.length,
    matched: filtered.length,
  });

  const installed =
    state !== "rows" ? (
      <SkillsListEmpty state={state} query={query} />
    ) : (
      <>
        <CatalogGrid>
          {visible.map((row) => (
            <CatalogRow
              key={row.slug}
              icon={
                <SkillIcon
                  image={row.summary.image}
                  bubbleClassName="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-line-input"
                />
              }
              title={skillDisplayTitle(row.summary)}
              description={row.summary.description || undefined}
              trailing={
                <div className="flex shrink-0 items-center gap-2">
                  {row.origin === "shared" && (
                    <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-chip-text">
                      {t("grid.sharedBadge")}
                    </span>
                  )}
                  {showAgentStack && <AgentStack agents={row.agents} />}
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-ink-muted"
                  />
                </div>
              }
              onClick={() => onOpenEditor(row)}
            />
          ))}
        </CatalogGrid>
        {showExpander && (
          <CatalogShowMore onClick={() => setExpanded(true)}>
            {t("grid.showAllSkills", { count: filtered.length })}
          </CatalogShowMore>
        )}
      </>
    );

  return { installedCount: filtered.length, installed };
}
