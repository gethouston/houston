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

/** Avatars a row shows before collapsing the rest into "+N". */
const ROW_AVATAR_CAP = 3;

/** The overlapping holder stack: who has this skill, at a glance. Shared
 *  with the per-agent Custom tab's "From your other agents" rows. */
export function AgentStack({ agents }: { agents: WorkspaceSkillAgent[] }) {
  const shown = agents.slice(0, ROW_AVATAR_CAP);
  const extra = agents.length - shown.length;
  return (
    <span className="flex items-center">
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
        <span className="-ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-chip px-1 text-[10px] tabular-nums text-chip-text">
          +{extra}
        </span>
      )}
    </span>
  );
}

/**
 * The global page's **Your skills** strip (HOU-792): the per-agent strip's row
 * grammar, aggregated per slug across the workspace — each row carries the
 * stack of agents holding a copy, and opens the manage dialog. Preview-capped
 * behind "Show all" at rest; an active query drops the cap.
 */
export function useWorkspaceSkillRows(
  rows: WorkspaceSkillRow[],
  query: string,
  onOpen: (row: WorkspaceSkillRow) => void,
): { installedCount: number; installed: ReactNode | undefined } {
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

  const installed =
    filtered.length === 0 ? undefined : (
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
                  <AgentStack agents={row.agents} />
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-ink-muted"
                  />
                </div>
              }
              onClick={() => onOpen(row)}
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
