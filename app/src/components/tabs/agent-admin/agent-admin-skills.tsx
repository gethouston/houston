import { SkillDetailPage } from "@houston-ai/skills";
import { useTranslation } from "react-i18next";
import { localizeSkillCopy } from "../../../lib/localize-skill-copy";
import { SkillsContent } from "../skills-content";
import { useSkillSurface } from "../use-skill-surface";
import {
  type AgentAdminScreenProps,
  AgentAdminScreenShell,
} from "./agent-admin-back-bar";

/**
 * Skills drill-in: the list, reusing {@link useSkillSurface} for install/search.
 * A selected skill's detail takes over the whole pane (its own back returns to
 * the list; the admin back bar returns to the landing). Always editable.
 */
export function AgentAdminSkills({ agent, onBack }: AgentAdminScreenProps) {
  const surface = useSkillSurface(agent.folderPath);
  const { t } = useTranslation("skills");

  if (surface.selectedSkill) {
    return (
      <SkillDetailPage
        skill={surface.selectedSkill}
        displayName={localizeSkillCopy(surface.selectedSkill, t).title}
        onBack={surface.clearSelectedSkill}
        onSave={surface.handleSkillSave}
        onDelete={surface.handleSkillDelete}
        labels={surface.skillDetailLabels}
      />
    );
  }

  return (
    <AgentAdminScreenShell onBack={onBack}>
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
      </div>
    </AgentAdminScreenShell>
  );
}
