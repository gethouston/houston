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
import { OtherAgentSkillPreview } from "./other-agent-skill-preview";

/**
 * "From your other agents" (HOU-792): the user's own skills that live on
 * OTHER agents in the workspace, offered on THIS agent's Custom tab so a
 * skill built for Agent A is one click away on Agent B. A row (and its +)
 * opens the PREVIEW modal — the shared marketplace/library treatment, with
 * the body loaded from the holder agent — and installing is the modal's one
 * commit point: read the holder's SKILL.md verbatim, write it here (the
 * Houston-library copy primitive). Rows already installed here show a quiet
 * check (never filtered out mid-session — no list jumps).
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
  const [preview, setPreview] = useState<WorkspaceSkillRow | null>(null);

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
              onClick={() => setPreview(row)}
              trailing={<AgentStack agents={row.agents} />}
              // `action`, never `trailing`: trailing renders INSIDE the row's
              // <button>, and a nested <button> corrupts the DOM tree.
              action={
                installedHere ? (
                  <span
                    role="img"
                    aria-label={t("fromYourAgents.installedAria", {
                      name: title,
                    })}
                    className="flex size-9 shrink-0 items-center justify-center text-ink-muted"
                  >
                    <Check aria-hidden className="size-4" />
                  </span>
                ) : (
                  <CatalogAddButton
                    label={t("fromYourAgents.installAria", { name: title })}
                    busy={installing === row.slug}
                    // The + previews too (the library convention): the
                    // modal's Install is the one commit point.
                    onClick={() => setPreview(row)}
                  />
                )
              }
            />
          );
        })}
      </CatalogGrid>
      <OtherAgentSkillPreview
        row={preview}
        onClose={() => setPreview(null)}
        install={(row) => void install(row)}
        installing={installing}
        installedSkillNames={installedSkillNames}
      />
    </div>
  );
}
