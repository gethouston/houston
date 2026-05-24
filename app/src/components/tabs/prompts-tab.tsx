import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FileText } from "lucide-react";
import type { TabProps, AgentMode } from "../../lib/types";
import { tauriAgent } from "../../lib/tauri";
import { queryKeys } from "../../lib/query-keys";
import { useInstructions, useSaveInstructions } from "../../hooks/queries";
import { AutoSaveTextarea } from "./configure-sections";

function usePromptFile(agentPath: string, modeName: string) {
  return useQuery({
    queryKey: [...queryKeys.instructions(agentPath), "mode", modeName],
    queryFn: () =>
      tauriAgent
        .readFile(agentPath, `.houston/prompts/modes/${modeName}`)
        .catch(() => ""),
    enabled: !!agentPath,
  });
}

function useSavePromptFile(agentPath: string, modeName: string) {
  return useCallback(
    async (content: string) => {
      await tauriAgent.writeFile(
        agentPath,
        `.houston/prompts/modes/${modeName}`,
        content,
      );
    },
    [agentPath, modeName],
  );
}

function PromptCard({
  agentPath,
  mode,
}: {
  agentPath: string;
  mode: AgentMode;
}) {
  const { t } = useTranslation("agents");
  const [open, setOpen] = useState(false);
  const { data: content } = usePromptFile(agentPath, mode.promptFile);
  const save = useSavePromptFile(agentPath, mode.promptFile);
  const lineCount = (content ?? "").split("\n").length;

  return (
    <div className="rounded-xl border border-border/30 bg-secondary overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
      >
        <FileText className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{mode.name}</p>
          <p className="text-xs text-muted-foreground/60 truncate">
            {t("promptCards.modeSummary", {
              file: mode.promptFile,
              count: lineCount,
            })}
          </p>
        </div>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <AutoSaveTextarea
            value={content ?? ""}
            onSave={save}
            placeholder={t("configure.agentPrompts.placeholder", {
              name: mode.name,
            })}
          />
        </div>
      )}
    </div>
  );
}

function ProjectContextCard({ agentPath }: { agentPath: string }) {
  const { t } = useTranslation("agents");
  const [open, setOpen] = useState(false);
  const { data: content } = useInstructions(agentPath);
  const save = useSaveInstructions(agentPath);
  const lineCount = (content ?? "").split("\n").length;

  return (
    <div className="rounded-xl border border-border/30 bg-secondary overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
      >
        <FileText className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {t("promptCards.projectContext")}
          </p>
          <p className="text-xs text-muted-foreground/60 truncate">
            {t("promptCards.claudeMdSummary", { count: lineCount })}
          </p>
        </div>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <AutoSaveTextarea
            value={content ?? ""}
            onSave={(c) => save.mutateAsync({ name: "CLAUDE.md", content: c })}
            placeholder={t("configure.projectContext.placeholder")}
          />
        </div>
      )}
    </div>
  );
}

export default function PromptsTab({ agent, agentDef }: TabProps) {
  const path = agent.folderPath;
  const modes = agentDef.config.agents ?? [];

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-3">
        <ProjectContextCard agentPath={path} />
        {modes.map((mode) => (
          <PromptCard key={mode.id} agentPath={path} mode={mode} />
        ))}
      </div>
    </div>
  );
}
