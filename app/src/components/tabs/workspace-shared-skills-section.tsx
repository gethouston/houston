import {
  CatalogAddButton,
  CatalogGrid,
  CatalogRow,
  CatalogSectionHeader,
} from "@houston-ai/core";
import { Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import type { Agent, SkillSummary } from "../../lib/types";
import { SkillIcon } from "../skill-icon";
import { useAgentSharedSkills } from "./use-agent-shared-skills";
import { WorkspaceSkillPreview } from "./workspace-skill-preview";

/**
 * "From your workspace" (ADR 0003): the workspace store's shared skills,
 * offered on THIS agent's Custom tab. A NOT-yet-active row opens the PREVIEW
 * modal (the shared marketplace treatment, body loaded from the store), and
 * enabling — from the modal or the row's `+` — is one reversible manifest
 * write, never a copy. An ACTIVE row (check) opens the same manage dialog a
 * "Your skills" strip row opens, where the skill is editable. The
 * shared-store sibling of "From your other agents": once a skill is shared
 * it stops living ON agents, so that section can no longer offer it — this
 * one does. Renders nothing on deployments without the store.
 */
export function WorkspaceSharedSkillsSection({
  agent,
  onManageSkill,
  installedSkillNames,
}: {
  agent: Agent;
  /** Opens an ACTIVE skill's manage dialog (owned by the Skills surface). */
  onManageSkill?: (slug: string) => void;
  /** Lowercase slugs already on THIS agent — their rows show the check. */
  installedSkillNames?: Set<string>;
}) {
  const { t } = useTranslation("skills");
  const shared = useAgentSharedSkills(agent.folderPath);
  const [preview, setPreview] = useState<SkillSummary | null>(null);

  if (!shared.available || shared.items.length === 0) return null;
  const activeHere = (skill: SkillSummary) =>
    shared.activeSlugs.has(skill.name) ||
    (installedSkillNames?.has(skill.name.toLowerCase()) ?? false);

  return (
    <div className="flex flex-col gap-3">
      <CatalogSectionHeader
        title={t("fromWorkspace.heading")}
        count={shared.items.length}
        size="lg"
      />
      <CatalogGrid>
        {shared.items.map((skill) => {
          const title = skillDisplayTitle(skill);
          return (
            <CatalogRow
              key={skill.name}
              icon={
                <SkillIcon
                  image={skill.image}
                  bubbleClassName="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-line-input"
                />
              }
              title={title}
              description={skill.description || undefined}
              onClick={() =>
                activeHere(skill) && onManageSkill
                  ? onManageSkill(skill.name)
                  : setPreview(skill)
              }
              // `action`, never `trailing`: trailing renders INSIDE the row's
              // <button>, and a nested <button> corrupts the DOM tree.
              action={
                activeHere(skill) ? (
                  <span
                    role="img"
                    aria-label={t("fromWorkspace.enabledAria", {
                      name: title,
                    })}
                    className="flex size-9 shrink-0 items-center justify-center text-ink-muted"
                  >
                    <Check aria-hidden className="size-4" />
                  </span>
                ) : (
                  <CatalogAddButton
                    label={t("fromWorkspace.enableAria", { name: title })}
                    busy={shared.busy === skill.name}
                    onClick={() => void shared.enable(skill.name)}
                  />
                )
              }
            />
          );
        })}
      </CatalogGrid>
      {shared.workspaceId !== null && (
        <WorkspaceSkillPreview
          workspaceId={shared.workspaceId}
          skill={preview}
          enabled={preview !== null && activeHere(preview)}
          enabling={preview !== null && shared.busy === preview.name}
          onEnable={(slug) => void shared.enable(slug)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
