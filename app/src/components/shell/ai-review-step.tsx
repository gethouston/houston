import {
  AGENT_COLORS,
  cn,
  colorHex,
  DialogTitle,
  HoustonAvatar,
  Input,
  resolveAgentColor,
} from "@houston-ai/core";
import { Check } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AiStepFooter } from "./ai-step-footer";

interface AiReviewStepProps {
  name: string;
  color: string | undefined;
  instructions: string;
  onNameChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onInstructionsChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  creating: boolean;
  error: string | null;
}

export function AiReviewStep({
  name,
  color,
  instructions,
  onNameChange,
  onColorChange,
  onInstructionsChange,
  onBack,
  onSubmit,
  creating,
  error,
}: AiReviewStepProps) {
  const { t } = useTranslation("shell");
  const resolvedColor = resolveAgentColor(color);

  useEffect(() => {
    if (!color) onColorChange(AGENT_COLORS[0].id);
  }, [color, onColorChange]);
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <DialogTitle className="sr-only">{t("aiReview.stepTitle")}</DialogTitle>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Avatar + color */}
          <div className="flex flex-col items-center gap-4">
            <HoustonAvatar color={resolvedColor} diameter={72} />
            <div className="flex items-center gap-2">
              {AGENT_COLORS.map((c) => {
                const hex = colorHex(c);
                const isSelected =
                  color === c.id || color === c.light || color === c.dark;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onColorChange(c.id)}
                    className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center transition-all duration-150",
                      isSelected
                        ? "ring-2 ring-offset-2 ring-foreground/30"
                        : "hover:scale-110",
                    )}
                    style={{ backgroundColor: hex }}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="ai-review-name"
              className="block text-sm font-medium"
            >
              {t("aiAssist.nameLabel")}
            </label>
            <Input
              id="ai-review-name"
              autoFocus
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t("aiAssist.namePlaceholder")}
              className="rounded-xl"
            />
          </div>

          {/* Instructions */}
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">
                {t("aiReview.instructionsLabel")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("aiReview.instructionsHelper")}
              </p>
            </div>
            <section className="rounded-xl bg-secondary p-3">
              <textarea
                value={instructions}
                onChange={(e) => onInstructionsChange(e.target.value)}
                rows={Math.max(10, instructions.split("\n").length + 2)}
                className={cn(
                  "w-full px-4 py-3 text-sm text-foreground leading-relaxed",
                  "bg-background border border-foreground/[0.04] rounded-lg",
                  "outline-none resize-none transition-shadow duration-200",
                  "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                )}
              />
            </section>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>

      <AiStepFooter
        onBack={onBack}
        primaryLabel={t("naming.createAgent")}
        onPrimary={onSubmit}
        primaryDisabled={!name.trim()}
        primaryLoading={creating}
      />
    </div>
  );
}
