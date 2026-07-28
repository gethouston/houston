import {
  CatalogAddButton,
  CatalogGrid,
  CatalogRow,
  CatalogSectionHeader,
} from "@houston-ai/core";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { logger } from "../../lib/logger";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgent, tauriSkills } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import { useAgentStore } from "../../stores/agents";
import { SkillIcon } from "../skill-icon";
import { useWorkspaceSkills } from "../skills-view/use-workspace-skills";
import { AgentStack } from "../skills-view/workspace-skill-rows";

/**
 * "From your other agents" (HOU-792): the user's own skills that live on
 * OTHER agents in the workspace, offered on THIS agent's Custom tab so a
 * skill built for Agent A is one click away on Agent B. Skills are per-agent
 * copies, so install = read the holder's SKILL.md and write it here — the
 * same copy primitive the Houston library uses. Rows already installed here
 * show a quiet check (never filtered out mid-session — no list jumps).
 *
 * Mounted only inside the Custom tab's content, so the cross-agent skill
 * fan-out (one request per OTHER agent; hosted mode wakes their pods) runs
 * only when the user actually opens the tab.
 */
export function OtherAgentSkills({
  agent,
  installedSkillNames,
}: {
  agent: Agent;
  /** Lowercase slugs already on THIS agent — their rows show the check. */
  installedSkillNames?: Set<string>;
}) {
  const { t } = useTranslation("skills");
  const queryClient = useQueryClient();
  const agents = useAgentStore((s) => s.agents);
  const others = agents.filter((a) => a.id !== agent.id);
  const { rows } = useWorkspaceSkills(others);
  const [installing, setInstalling] = useState<string | null>(null);

  const install = useCallback(
    async (row: WorkspaceSkillRow) => {
      if (installing) return;
      setInstalling(row.slug);
      try {
        // The holder's copy verbatim (full SKILL.md, frontmatter intact).
        const detail = await tauriSkills.load(
          row.agents[0].folderPath,
          row.slug,
        );
        await tauriAgent.writeFile(
          agent.folderPath,
          `.agents/skills/${row.slug}/SKILL.md`,
          detail.content,
        );
        analytics.track("skill_installed", {
          skill_slug: row.slug,
          source: "agent-copy",
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.skills(agent.folderPath),
        });
      } catch (err) {
        // call() already toasted the load/write failure; log so the
        // rejection isn't silent.
        logger.error(`[skills] copy ${row.slug} from agent failed: ${err}`);
      } finally {
        setInstalling(null);
      }
    },
    [agent.folderPath, installing, queryClient],
  );

  if (others.length === 0 || rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <CatalogSectionHeader
        title={t("fromYourAgents.heading")}
        count={rows.length}
        size="lg"
      />
      <CatalogGrid>
        {rows.map((row) => {
          const title = skillDisplayTitle(row.summary);
          const installedHere = installedSkillNames?.has(
            row.slug.toLowerCase(),
          );
          return (
            <CatalogRow
              key={row.slug}
              icon={
                <SkillIcon
                  image={row.summary.image}
                  bubbleClassName="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-line-input"
                />
              }
              title={title}
              description={row.summary.description || undefined}
              trailing={
                <div className="flex shrink-0 items-center gap-2">
                  <AgentStack agents={row.agents} />
                  {installedHere ? (
                    <span
                      role="img"
                      aria-label={t("fromYourAgents.installedAria", {
                        name: title,
                      })}
                      className="flex size-7 items-center justify-center text-ink-muted"
                    >
                      <Check aria-hidden className="size-4" />
                    </span>
                  ) : (
                    <CatalogAddButton
                      label={t("fromYourAgents.installAria", { name: title })}
                      busy={installing === row.slug}
                      disabled={installing !== null}
                      onClick={() => void install(row)}
                    />
                  )}
                </div>
              }
            />
          );
        })}
      </CatalogGrid>
    </div>
  );
}
