import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DialogTitle } from "@houston-ai/core";
import type { SuggestedRoutine } from "@houston-ai/engine-client";
import { tauriAgents, tauriProvider } from "../../lib/tauri";
import { AgentSetupForm, type AgentSetupFormValues } from "./agent-setup-form";
import { AiStepFooter } from "./ai-step-footer";
import { serializeFormValues } from "./agent-setup-utils";
import { InlineModelSelector } from "./naming-step";

interface AiAssistStepProps {
  provider: string;
  model: string;
  /** Lift the picker change so the parent dialog can use it as the brain for
   * the assist call AND the saved provider/model on the created agent. */
  onProviderChange: (provider: string, model: string) => void;
  onBack: () => void;
  /** Called with the final CLAUDE.md content, suggested name, and an optional routine. */
  onContinue: (
    instructions: string,
    suggestedName: string,
    routine: SuggestedRoutine | null,
  ) => void;
}

const DEFAULT_FORM: AgentSetupFormValues = {
  focus: "",
  traits: [],
  verbosity: 3,
  askFirst: false,
  extra: "",
};

export function AiAssistStep({
  provider,
  model,
  onProviderChange,
  onBack,
  onContinue,
}: AiAssistStepProps) {
  const { t } = useTranslation("shell");
  const [form, setForm] = useState<AgentSetupFormValues>(DEFAULT_FORM);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handlePickerChange = (next: string, nextModel: string) => {
    onProviderChange(next, nextModel);
    // Sticky default is updated only after the user actually generates with
    // this brain (see handleGenerate). Updating on every dropdown poke would
    // make the next new agent inherit a model the user never committed to.
  };

  const canGenerate = !!form.focus && !generating;

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
  };

  const handleGenerate = async () => {
    const description = serializeFormValues(form);
    setError(null);
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Persist the brain choice once the user commits to generating. This
      // keeps the sticky default in sync with what actually built the agent.
      await tauriProvider.setLastUsed(provider, model);
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
        : name ? `# ${name}\n\n${body}` : body;
      onContinue(
        instructions,
        name,
        result.suggestedRoutine ?? null,
      );
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
            <h2 className="text-base font-semibold">{t("aiAssist.stepTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("aiAssist.cardDescription")}</p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("aiAssist.brainLabel")}
            </p>
            <InlineModelSelector
              provider={provider}
              model={model}
              onSelect={handlePickerChange}
            />
          </div>

          <AgentSetupForm values={form} onChange={setForm} disabled={generating} />

          {error && !generating && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-destructive">{t("aiAssist.errorTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("aiAssist.errorDescription")}</p>
              <p className="text-xs font-mono text-muted-foreground/80 break-words whitespace-pre-wrap">{error}</p>
            </div>
          )}
        </div>
      </div>

      <AiStepFooter
        onBack={onBack}
        primaryLabel={generating ? t("aiAssist.generatingMessage") : t("aiAssist.generateButton")}
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
