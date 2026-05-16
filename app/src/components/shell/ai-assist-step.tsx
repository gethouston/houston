import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button, DialogTitle, Spinner, cn } from "@houston-ai/core";
import type { SuggestedIntegration, SuggestedRoutine } from "@houston-ai/engine-client";
import { tauriAgents } from "../../lib/tauri";
import { AiAssistResult } from "./ai-assist-result";

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

export function AiAssistStep({ provider, model, onBack, onContinue }: AiAssistStepProps) {
  const { t } = useTranslation("shell");
  const [description, setDescription] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState("");
  const [instructions, setInstructions] = useState<string | null>(null);
  const [suggestedIntegrations, setSuggestedIntegrations] = useState<SuggestedIntegration[]>([]);
  const [suggestedRoutine, setSuggestedRoutine] = useState<SuggestedRoutine | null>(null);

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) {
      setValidationError(t("aiAssist.descriptionRequired"));
      return;
    }
    setValidationError(null);
    setError(null);
    setGenerating(true);
    setInstructions(null);
    setSuggestedIntegrations([]);
    setSuggestedRoutine(null);
    try {
      const result = await tauriAgents.generateInstructions(trimmed, { provider, model });
      setSuggestedName(result.name);
      setInstructions(result.instructions);
      setSuggestedIntegrations(result.suggestedIntegrations);
      setSuggestedRoutine(result.suggestedRoutine ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleContinue = () => {
    if (instructions === null) return;
    const name = suggestedName.trim();
    const heading = name ? `# ${name}\n\n` : "";
    onContinue(`${heading}${instructions}`, name, suggestedIntegrations, suggestedRoutine);
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
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{t("aiAssist.stepTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("aiAssist.cardDescription")}</p>
            </div>
          </div>

          <form onSubmit={handleGenerate} className="space-y-3">
            <label className="block text-sm font-medium">{t("aiAssist.descriptionLabel")}</label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder={t("aiAssist.descriptionPlaceholder")}
              rows={4}
              disabled={generating}
              className={cn(
                "w-full px-4 py-3 text-sm text-foreground leading-relaxed",
                "placeholder:text-muted-foreground/60",
                "bg-secondary border border-black/[0.04] rounded-xl",
                "outline-none resize-none transition-shadow duration-200",
                "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            />
            {validationError && <p className="text-xs text-destructive">{validationError}</p>}
            <Button
              type="submit"
              disabled={generating || !description.trim()}
              className="w-full rounded-full"
            >
              {generating ? (
                <><Spinner className="size-4" />{t("aiAssist.generatingMessage")}</>
              ) : (
                <><Sparkles className="size-4" />{instructions !== null ? t("aiAssist.retryButton") : t("aiAssist.generateButton")}</>
              )}
            </Button>
          </form>

          {error && !generating && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-destructive">{t("aiAssist.errorTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("aiAssist.errorDescription")}</p>
              <p className="text-xs font-mono text-muted-foreground/80 break-words whitespace-pre-wrap">{error}</p>
            </div>
          )}

          {instructions !== null && !generating && (
            <AiAssistResult
              name={suggestedName}
              onNameChange={setSuggestedName}
              instructions={instructions}
              onInstructionsChange={setInstructions}
              onContinue={handleContinue}
            />
          )}
        </div>
      </div>
    </div>
  );
}
