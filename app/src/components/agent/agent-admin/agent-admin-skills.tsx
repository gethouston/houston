import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { mergeSharedIntoAgentSkills } from "../../../lib/agent-shared-skills";
import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
import { PageHero } from "../../shell/page-shell";
import { SkillsContent } from "../skills-content";
import { useAgentSharedSkills } from "../use-agent-shared-skills";
import { useSkillSurface } from "../use-skill-surface";
import { useSkillSurfaceLabels } from "../use-skill-surface-labels";

/**
 * Skills section: the catalog-grammar Skills surface (installed-tile strip +
 * Store / Custom skills tabs), reusing {@link useSkillSurface} for
 * install/search and edit/delete. On shared-store deployments (ADR 0003) the
 * strip also shows the workspace skills this agent's manifest enables — the
 * agent HAS them at runtime, so hiding them here made every enable look like
 * a no-op. Every strip row opens the per-agent manage dialog, which resolves
 * the slug itself: a local copy is edited/deleted in place, a store skill's
 * save writes the ONE workspace copy and its danger action is "Disable for
 * this agent" (a reversible manifest write). A row's setup chat (HOU-791)
 * stays reachable via the dialog's Edit in chat.
 */
export function AgentAdminSkills({ agent }: AgentSectionProps) {
  const { t } = useTranslation("agents");
  const surface = useSkillSurface(agent.folderPath);
  const shared = useAgentSharedSkills(agent.folderPath);
  const { editModalLabels, deleteConfirm } = useSkillSurfaceLabels();

  const merged = useMemo(
    () =>
      mergeSharedIntoAgentSkills({
        local: surface.skills,
        shared: shared.items,
        enabled: shared.activeSlugs,
      }),
    [surface.skills, shared.items, shared.activeSlugs],
  );
  const installedSkillNames = useMemo(
    () => new Set(merged.skills.map((s) => s.name.toLowerCase())),
    [merged.skills],
  );

  return (
    <div className="max-w-3xl mx-auto w-full px-6 pb-12 pt-2 flex-1 flex flex-col">
      <PageHero
        level={2}
        className="mb-6"
        title={t("subTabs.skills")}
        subtitle={t("configure.skills.description")}
      />
      <SkillsContent
        agent={agent}
        skills={merged.skills}
        loading={surface.skillsLoading}
        editingSkillName={surface.editingSkillName}
        editorState={surface.editorState}
        onEditSkill={surface.openEditSkill}
        onCloseEdit={surface.closeEditSkill}
        onSaveEditing={surface.handleSaveEditing}
        onDeleteSkill={surface.handleSkillDelete}
        editModalLabels={editModalLabels}
        deleteConfirm={deleteConfirm}
        onSearch={surface.handleSearch}
        onInstallCommunity={surface.handleInstallCommunity}
        onPreviewCommunity={surface.handlePreview}
        onListFromRepo={surface.handleListFromRepo}
        onInstallFromRepo={surface.handleInstallFromRepo}
        onCreateFromScratch={surface.handleCreateFromScratch}
        installedSkillNames={installedSkillNames}
      />
    </div>
  );
}
