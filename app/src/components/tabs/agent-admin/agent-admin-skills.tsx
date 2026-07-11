import { SkillsContent } from "../skills-content";
import { useSkillSurface } from "../use-skill-surface";
import { useSkillSurfaceLabels } from "../use-skill-surface-labels";
import type { AgentAdminScreenProps } from "./agent-admin-nav.ts";

/**
 * Skills section: the installed-skill list (rows with an inline editor) plus the
 * community marketplace, reusing {@link useSkillSurface} for install/search and
 * edit/delete. Editing opens a modal from the row now, so there is no separate
 * detail screen. Always editable.
 */
export function AgentAdminSkills({ agent }: AgentAdminScreenProps) {
  const surface = useSkillSurface(agent.folderPath);
  const { installedRowLabels, editModalLabels, deleteConfirm } =
    useSkillSurfaceLabels();

  return (
    <div className="max-w-3xl mx-auto w-full px-6 pb-12 pt-6 flex-1 flex flex-col">
      <SkillsContent
        skills={surface.skills}
        loading={surface.skillsLoading}
        editingSkillName={surface.editingSkillName}
        editorState={surface.editorState}
        onEditSkill={surface.openEditSkill}
        onCloseEdit={surface.closeEditSkill}
        onSaveEditing={surface.handleSaveEditing}
        onDeleteSkill={surface.handleSkillDelete}
        installedRowLabels={installedRowLabels}
        editModalLabels={editModalLabels}
        deleteConfirm={deleteConfirm}
        onSearch={surface.handleSearch}
        onInstallCommunity={surface.handleInstallCommunity}
        onPreviewCommunity={surface.handlePreview}
        onListFromRepo={surface.handleListFromRepo}
        onInstallFromRepo={surface.handleInstallFromRepo}
        onCreateFromScratch={surface.handleCreateFromScratch}
        installedSkillNames={surface.installedSkillNames}
      />
    </div>
  );
}
