import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, LibraryBig, Brain, Settings } from "lucide-react";
import { SkillDetailPage } from "@houston-ai/skills";
import {
  useInstructions,
  useSaveInstructions,
  useLearnings,
  useAddLearning,
  useRemoveLearning,
  useUpdateLearning,
} from "../../hooks/queries";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAgentStore } from "../../stores/agents";
import { LearningsContent } from "./learnings-content";
import { InstructionsContent, type SubTab } from "./job-description-parts";
import { AgentSettingsContent } from "./agent-settings-content";
import { SkillsContent } from "./skills-content";
import { useSkillSurface } from "./use-skill-surface";
import {
  SidebarSectionNav,
  type SidebarSectionItem,
} from "../shared/sidebar-section-nav";

export default function JobDescriptionTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const path = agent.folderPath;
  const surface = useSkillSurface(path);
  const [activeTab, setActiveTab] = useState<SubTab>("instructions");
  const targetTab = useUIStore((s) => s.jobDescriptionTarget);
  const setTargetTab = useUIStore((s) => s.setJobDescriptionTarget);
  const setShareAgentId = useUIStore((s) => s.setShareAgentId);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const renameAgent = useAgentStore((s) => s.rename);
  const deleteAgent = useAgentStore((s) => s.delete);
  const updateAgentColor = useAgentStore((s) => s.updateColor);

  const { data: instructions } = useInstructions(path);
  const saveInstructions = useSaveInstructions(path);

  const { data: learningsData } = useLearnings(path);
  const addLearning = useAddLearning(path);
  const removeLearning = useRemoveLearning(path);
  const updateLearning = useUpdateLearning(path);

  useEffect(() => {
    if (!targetTab) return;
    setActiveTab(targetTab);
    surface.clearSelectedSkill();
    setTargetTab(null);
  }, [targetTab, setTargetTab, surface.clearSelectedSkill]);

  const items = useMemo<SidebarSectionItem<SubTab>[]>(
    () => [
      { id: "instructions", label: t("subTabs.instructions"), icon: FileText },
      { id: "skills", label: t("subTabs.skills"), icon: LibraryBig },
      { id: "learnings", label: t("subTabs.learnings"), icon: Brain },
      { id: "general", label: t("subTabs.general"), icon: Settings },
    ],
    [t],
  );

  // Skill detail view takes over the whole pane.
  if (activeTab === "skills" && surface.selectedSkill) {
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
    <div className="flex-1 flex min-h-0 bg-background">
      <SidebarSectionNav
        ariaLabel={agent.name}
        items={items}
        active={activeTab}
        onSelect={setActiveTab}
      />
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {activeTab === "instructions" && (
          <InstructionsContent
            content={instructions ?? ""}
            onSave={(c) =>
              saveInstructions.mutateAsync({ name: "CLAUDE.md", content: c })
            }
          />
        )}

        {activeTab === "skills" && (
          <div className="max-w-3xl mx-auto w-full px-6 pb-12 pt-6 flex-1 flex flex-col">
            <SkillsContent
              skills={surface.skills}
              loading={surface.skillsLoading}
              onSkillClick={surface.selectSkill}
              onCreateFromScratch={surface.handleCreateFromScratch}
              installedSkillNames={surface.installedSkillNames}
            />
          </div>
        )}

        {activeTab === "learnings" && (
          <LearningsContent
            entries={learningsData?.entries ?? []}
            onAdd={(text) => addLearning.mutateAsync(text)}
            onRemove={(index) => removeLearning.mutateAsync(index)}
            onUpdate={(id, text) => updateLearning.mutateAsync({ id, text })}
          />
        )}

        {activeTab === "general" && (
          <AgentSettingsContent
            name={agent.name}
            color={agent.color}
            onRename={(newName) =>
              currentWorkspace
                ? renameAgent(currentWorkspace.id, agent.id, newName)
                : Promise.resolve()
            }
            onChangeColor={(color) =>
              currentWorkspace
                ? updateAgentColor(currentWorkspace.id, agent.id, color)
                : Promise.resolve()
            }
            onShare={() => setShareAgentId(agent.id)}
            onDelete={() =>
              currentWorkspace
                ? deleteAgent(currentWorkspace.id, agent.id)
                : Promise.resolve()
            }
          />
        )}
      </div>
    </div>
  );
}
