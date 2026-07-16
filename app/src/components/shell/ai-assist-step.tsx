import {
  cn,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import type { SuggestedRoutine } from "@houston-ai/engine-client";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-toast";
import { tauriAgents } from "../../lib/tauri";
import { ChatModelSelector } from "../chat-model-selector";
import { AgentBriefForm } from "./agent-brief-form";
import { AiStepFooter } from "./ai-step-footer";

interface AiAssistStepProps {
  provider: string;
  model: string;
  /** Picker changes lift to the dialog: the pair drives this generation turn
   * AND becomes the created agent's brain. Effort has no control here — the
   * engine runs reasoning models at its default (medium). */
  onModelChange: (provider: string, model: string) => void;
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
  onModelChange,
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
      setError(genericErrorDescription("generate_ai_assist_instructions", err));
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Fixed header, the same pattern as the picker step: the title never
          scrolls away and renders at the dialog's standard size. The model
          row sits right under it — the user picks the generation brain
          before writing the brief. */}
      <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-ink/[0.06]">
        <div className="max-w-2xl mx-auto w-full space-y-2">
          <DialogTitle>{t("aiAssist.stepTitle")}</DialogTitle>
          <DialogDescription>{t("aiAssist.stepDescription")}</DialogDescription>
          <div className="flex items-center gap-2.5 pt-1">
            <span className="text-sm text-ink-muted">
              {t("aiAssist.modelLabel")}
            </span>
            {/* ChatModelSelector has no disabled prop; gate interaction while a
                generation is in flight so the request's brain can't drift. The
                border gives the bare pill a visible select affordance. */}
            <div
              className={cn(
                "rounded-lg border border-line bg-chip",
                generating && "pointer-events-none opacity-50",
              )}
            >
              <ChatModelSelector
                provider={provider}
                model={model}
                onSelect={onModelChange}
                agent={null}
              />
            </div>
          </div>
        </div>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <AgentBriefForm
            value={brief}
            onChange={onBriefChange}
            disabled={generating}
          />

          {error && !generating && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-danger">
                {t("aiAssist.errorTitle")}
              </p>
              <p className="text-xs text-ink-muted">
                {t("aiAssist.errorDescription")}
              </p>
              <p className="text-xs font-mono text-ink-muted/80 break-words whitespace-pre-wrap">
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
