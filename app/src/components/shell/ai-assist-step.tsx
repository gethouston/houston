import { DialogTitle } from "@houston-ai/core";
import type { SuggestedRoutine } from "@houston-ai/engine-client";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { tauriAgents } from "../../lib/tauri";
import { AgentBriefForm } from "./agent-brief-form";
import { AiStepFooter } from "./ai-step-footer";

interface AiAssistStepProps {
  provider: string;
  model: string;
  /** The consultant brief lives in the dialog so navigating back from the
   * routine/review steps doesn't wipe the user's typed text. */
  brief: string;
  onBriefChange: (value: string) => void;
  onBack: () => void;
  /** Called with the final CLAUDE.md content, suggested name, and an optional routine. */
  onContinue: (
    instructions: string,
    suggestedName: string,
    routine: SuggestedRoutine | null,
  ) => void;
}

export function AiAssistStep({
  provider,
  model,
  brief,
  onBriefChange,
  onBack,
  onContinue,
}: AiAssistStepProps) {
  const { t } = useTranslation("shell");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canGenerate = !!brief.trim() && !generating;

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
  };

  const handleGenerate = async () => {
    const description = brief.trim();
    setError(null);
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await tauriAgents.generateInstructions(description, {
        provider,
        model,
        signal: controller.signal,
      });
      const name = result.name ?? "";
      // Ensure a # Name heading is always present. The engine sometimes includes
      // it and sometimes doesn't, so we add it only when it's missing.
      const body = result.instructions;
      const instructions = body.trimStart().startsWith("# ")
        ? body
        : name
          ? `# ${name}\n\n${body}`
          : body;
      onContinue(instructions, name, result.suggestedRoutine ?? null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <DialogTitle className="sr-only">{t("aiAssist.stepTitle")}</DialogTitle>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h2 className="text-base font-semibold">
              {t("aiAssist.stepTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("aiAssist.stepDescription")}
            </p>
          </div>

          <AgentBriefForm
            value={brief}
            onChange={onBriefChange}
            disabled={generating}
          />

          {error && !generating && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-destructive">
                {t("aiAssist.errorTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("aiAssist.errorDescription")}
              </p>
              <p className="text-xs font-mono text-muted-foreground/80 break-words whitespace-pre-wrap">
                {error}
              </p>
            </div>
          )}
        </div>
      </div>

      <AiStepFooter
        onBack={onBack}
        primaryLabel={
          generating
            ? t("aiAssist.generatingMessage")
            : t("aiAssist.generateButton")
        }
        onPrimary={handleGenerate}
        primaryDisabled={!canGenerate}
        primaryLoading={generating}
        secondary={
          generating
            ? { label: t("aiAssist.cancelButton"), onClick: handleCancel }
            : null
        }
      />
    </div>
  );
}
