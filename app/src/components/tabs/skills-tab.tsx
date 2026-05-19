import { useTranslation } from "react-i18next";
import { SkillDetailPage } from "@houston-ai/skills";
import type { TabProps } from "../../lib/types";
import { SkillsContent } from "./skills-content";
import { useSkillSurface } from "./use-skill-surface";

export default function SkillsTab({ agent }: TabProps) {
  const { t } = useTranslation("skills");
  const surface = useSkillSurface(agent.folderPath);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <h2 className="text-sm font-medium text-foreground">{t("page.title")}</h2>
        <p className="text-xs text-muted-foreground/60 mt-0.5 mb-3">
          {t("page.description")}
        </p>
        {surface.selectedSkill ? (
          <SkillDetailPage
            skill={surface.selectedSkill}
            onBack={surface.clearSelectedSkill}
            onSave={surface.handleSkillSave}
            onDelete={surface.handleSkillDelete}
            labels={surface.skillDetailLabels}
          />
        ) : (
          <SkillsContent
            skills={surface.skills}
            loading={surface.skillsLoading}
            onSkillClick={surface.selectSkill}
            onSearch={surface.handleSearch}
            onPopular={surface.handlePopular}
            onInstallCommunity={surface.handleInstallCommunity}
            onListFromRepo={surface.handleListFromRepo}
            onInstallFromRepo={surface.handleInstallFromRepo}
            onCreateFromScratch={surface.handleCreateFromScratch}
            installedSkillNames={surface.installedSkillNames}
          />
        )}
      </div>
    </div>
  );
}
