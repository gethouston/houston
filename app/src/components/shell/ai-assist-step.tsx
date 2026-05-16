import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button, DialogTitle, Spinner } from "@houston-ai/core";
import type { SuggestedIntegration, SuggestedRoutine } from "@houston-ai/engine-client";
import { tauriAgents } from "../../lib/tauri";
import { AgentSetupForm, type AgentSetupFormValues } from "./agent-setup-form";
import { serializeFormValues } from "./agent-setup-utils";

interface AiAssistStepProps {
  provider: string;
  model: string;
  onBack: () => void;
  /** Called with the final CLAUDE.md content, suggested name, integrations, and an optional routine. */
  onContinue: (
    instructions: string,
    suggestedName: string,
    integrations: SuggestedIntegration[],
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

export function AiAssistStep({ provider, model, onBack, onContinue }: AiAssistStepProps) {
  const { t } = useTranslation("shell");
  const [form, setForm] = useState<AgentSetupFormValues>(DEFAULT_FORM);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        result.suggestedIntegrations,
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
      <button
        type="button"
        onClick={onBack}
        aria-label={t("common:actions.back")}
        className="absolute top-5 left-5 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <DialogTitle className="sr-only">{t("aiAssist.stepTitle")}</DialogTitle>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-14">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h2 className="text-base font-semibold">{t("aiAssist.stepTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("aiAssist.cardDescription")}</p>
          </div>

          <AgentSetupForm values={form} onChange={setForm} disabled={generating} />

          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-fit rounded-full"
            >
              {generating ? (
                <><Spinner className="size-4" />{t("aiAssist.generatingMessage")}</>
              ) : (
                t("aiAssist.generateButton")
              )}
            </Button>
            {generating && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancel}
                className="w-fit rounded-full"
              >
                {t("aiAssist.cancelButton")}
              </Button>
            )}
          </div>

          {error && !generating && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-destructive">{t("aiAssist.errorTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("aiAssist.errorDescription")}</p>
              <p className="text-xs font-mono text-muted-foreground/80 break-words whitespace-pre-wrap">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
