import { SkillDetailPage } from "@houston-ai/skills";
import { SkillTranslateDialog } from "../skill-translate-dialog";
import { SkillsContent } from "../skills-content";
import { useSkillSurface } from "../use-skill-surface";
import type { AgentAdminScreenProps } from "./agent-admin-nav.ts";

/**
 * Skills section: the list, reusing {@link useSkillSurface} for install/search.
 * A selected skill's detail takes over the whole pane (its own back returns to
 * the list). Always editable.
 */
export function AgentAdminSkills({ agent }: AgentAdminScreenProps) {
  const surface = useSkillSurface(agent.folderPath);

  if (surface.selectedSkill) {
    return (
      <SkillDetailPage
        skill={surface.selectedSkill}
        onBack={surface.clearSelectedSkill}
        onSave={surface.handleSkillSave}
        onDelete={surface.handleSkillDelete}
        labels={surface.skillDetailLabels}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-6 pb-12 pt-6 flex-1 flex flex-col">
      <SkillsContent
        skills={surface.skills}
        loading={surface.skillsLoading}
        loadingSkillName={surface.loadingSkillName}
        onSkillClick={surface.selectSkill}
        onSearch={surface.handleSearch}
        onPopular={surface.handlePopular}
        onInstallCommunity={surface.handleInstallCommunity}
        onListFromRepo={surface.handleListFromRepo}
        onInstallFromRepo={surface.handleInstallFromRepo}
        onCreateFromScratch={surface.handleCreateFromScratch}
        installedSkillNames={surface.installedSkillNames}
      />
      <SkillTranslateDialog
        open={surface.translateOffer.length > 0}
        count={surface.translateOffer.length}
        languageName={surface.translateLanguageName}
        busy={surface.translating}
        onChoose={surface.handleTranslateChoose}
        onDismiss={surface.dismissTranslate}
      />
    </div>
  );
}
