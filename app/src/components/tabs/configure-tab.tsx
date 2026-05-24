import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { SkillDetailPage } from "@houston-ai/skills";
import type { TabProps, AgentMode } from "../../lib/types";
import { tauriAgent, tauriConfig } from "../../lib/tauri";
import { queryKeys } from "../../lib/query-keys";
import {
  useInstructions,
  useSaveInstructions,
  useLearnings,
  useAddLearning,
  useRemoveLearning,
  useUpdateLearning,
} from "../../hooks/queries";
import { Section, AutoSaveTextarea, SettingsForm } from "./configure-sections";
import { LearningsContent } from "./learnings-content";
import { SkillsContent } from "./skills-content";
import { useSkillSurface } from "./use-skill-surface";

function usePromptFile(agentPath: string, fileName: string) {
  return useQuery({
    queryKey: [...queryKeys.instructions(agentPath), "prompt", fileName],
    queryFn: () =>
      tauriAgent
        .readFile(agentPath, `.houston/prompts/${fileName}`)
        .catch(() => ""),
    enabled: !!agentPath,
  });
}

function useSavePromptFile(agentPath: string, fileName: string) {
  return useCallback(
    async (content: string) => {
      await tauriAgent.writeFile(
        agentPath,
        `.houston/prompts/${fileName}`,
        content,
      );
    },
    [agentPath, fileName],
  );
}

function PromptEditor({
  agentPath,
  mode,
}: {
  agentPath: string;
  mode: AgentMode;
}) {
  const { t } = useTranslation("agents");
  const { data: content } = usePromptFile(agentPath, mode.promptFile);
  const save = useSavePromptFile(agentPath, mode.promptFile);
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
        {mode.name}
      </label>
      <AutoSaveTextarea
        value={content ?? ""}
        onSave={save}
        placeholder={t("configure.agentPrompts.placeholder", {
          name: mode.name,
        })}
      />
    </div>
  );
}

export default function ConfigureTab({ agent, agentDef }: TabProps) {
  const { t } = useTranslation("agents");
  const path = agent.folderPath;
  const surface = useSkillSurface(path);
  const modes = agentDef.config.agents ?? [];

  const { data: instructions } = useInstructions(path);
  const saveInstructions = useSaveInstructions(path);

  const { data: learningsData } = useLearnings(path);
  const addLearning = useAddLearning(path);
  const removeLearning = useRemoveLearning(path);
  const updateLearning = useUpdateLearning(path);

  const { data: config } = useQuery({
    queryKey: queryKeys.config(path),
    queryFn: () => tauriConfig.read(path).catch(() => ({})),
  });

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-10">
        <Section
          title={t("configure.projectContext.title")}
          description={t("configure.projectContext.description")}
        >
          <AutoSaveTextarea
            value={instructions ?? ""}
            onSave={(content) =>
              saveInstructions.mutateAsync({ name: "CLAUDE.md", content })
            }
            placeholder={t("configure.projectContext.placeholder")}
          />
        </Section>

        {modes.length > 0 && (
          <Section
            title={t("configure.agentPrompts.title")}
            description={t("configure.agentPrompts.description")}
          >
            <div className="flex flex-col gap-5">
              {modes.map((mode) => (
                <PromptEditor key={mode.id} agentPath={path} mode={mode} />
              ))}
            </div>
          </Section>
        )}

        <Section
          title={t("configure.skills.title")}
          description={t("configure.skills.description")}
        >
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
              installedSkillNames={surface.installedSkillNames}
            />
          )}
        </Section>

        <Section
          title={t("configure.learnings.title")}
          description={t("configure.learnings.description")}
        >
          <LearningsContent
            entries={learningsData?.entries ?? []}
            onAdd={(txt) => addLearning.mutateAsync(txt)}
            onRemove={(i) => removeLearning.mutateAsync(i)}
            onUpdate={(id, text) => updateLearning.mutateAsync({ id, text })}
            layout="section"
          />
        </Section>

        <Section title={t("configure.settings.title")}>
          <SettingsForm agentPath={path} config={config ?? {}} />
        </Section>
      </div>
    </div>
  );
}
