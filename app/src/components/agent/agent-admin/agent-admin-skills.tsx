import { useMemo } from "react";
import { mergeSharedIntoAgentSkills } from "../../../lib/agent-shared-skills";
import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
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
 *
 * `readOnly` (a non-manager reading the agent settings page) drops the
 * discovery tabs and the write affordances via {@link SkillsContent}'s own
 * mode, leaving the installed strip.
 */
export function AgentAdminSkills({
  agent,
  readOnly = false,
}: AgentSectionProps) {
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
    <div className="max-w-3xl mx-auto w-full px-6 pb-12 pt-6 flex-1 flex flex-col">
      <SkillsContent
        agent={agent}
        skills={merged.skills}
        loading={surface.skillsLoading}
        readOnly={readOnly}
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
