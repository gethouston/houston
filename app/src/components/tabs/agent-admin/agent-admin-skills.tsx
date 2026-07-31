import { useMemo, useState } from "react";
import { mergeSharedIntoAgentSkills } from "../../../lib/agent-shared-skills";
import { SkillsContent } from "../skills-content";
import { useAgentSharedSkills } from "../use-agent-shared-skills";
import { useSkillSurface } from "../use-skill-surface";
import { useSkillSurfaceLabels } from "../use-skill-surface-labels";
import { WorkspaceSkillPreview } from "../workspace-skill-preview";
import type { AgentAdminScreenProps } from "./agent-admin-nav.ts";

/**
 * Skills section: the catalog-grammar Skills surface (installed-tile strip +
 * Store / Custom skills tabs), reusing {@link useSkillSurface} for
 * install/search and edit/delete. On shared-store deployments (ADR 0003) the
 * strip also shows the workspace skills this agent's manifest enables — the
 * agent HAS them at runtime, so hiding them here made every enable look like
 * a no-op; their rows open the workspace PREVIEW (the store is the one copy —
 * there is no per-agent copy to manage). A local skill row opens its
 * persistent setup chat (HOU-791); the raw-markdown modal stays reachable
 * from the chat header. Always editable.
 */
export function AgentAdminSkills({ agent }: AgentAdminScreenProps) {
  const surface = useSkillSurface(agent.folderPath);
  const shared = useAgentSharedSkills(agent.folderPath);
  const { editModalLabels, deleteConfirm } = useSkillSurfaceLabels();
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

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
  const previewSkill =
    previewSlug === null
      ? null
      : (shared.items.find((s) => s.name === previewSlug) ?? null);

  return (
    <div className="max-w-3xl mx-auto w-full px-6 pb-12 pt-6 flex-1 flex flex-col">
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
        sharedSkillSlugs={merged.sharedNames}
        onOpenSharedSkill={setPreviewSlug}
      />
      {shared.workspaceId !== null && (
        <WorkspaceSkillPreview
          workspaceId={shared.workspaceId}
          skill={previewSkill}
          // Only manifest-enabled store skills reach the strip, so the
          // preview always opens in its Enabled state here.
          enabled
          enabling={false}
          onEnable={() => {}}
          onClose={() => setPreviewSlug(null)}
        />
      )}
    </div>
  );
}
